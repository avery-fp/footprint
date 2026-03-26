import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'
import { getUserIdFromRequest } from '@/lib/auth'
import { tilesPostSchema, tilesDeleteSchema, tilesPutSchema, tilesPatchSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('MULTI', '/api/tiles')

/**
 * Get serial_number from slug + verify the requesting user owns it.
 * Returns null if not found or not owned.
 */
async function getSerialNumber(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  slug: string
): Promise<number | null> {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return null

  const { data: footprint } = await supabase
    .from('footprints')
    .select('serial_number, user_id')
    .eq('username', slug)
    .single()

  if (!footprint || footprint.user_id !== userId) return null

  return footprint.serial_number
}

/**
 * POST /api/tiles
 *
 * Add a tile (link/embed) to the links table.
 * Server derives serial_number from slug via ownership check.
 *
 * Body: { slug, url } or { slug, thought: "text" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(tilesPostSchema, body)
    if (!v.success) return v.response
    const { slug, url, thought, room_id } = v.data

    const supabase = createServerSupabaseClient()

    const serialNumber = await getSerialNumber(request, supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Unauthorized or not found' }, { status: 403 })
    }

    // Parse the URL or create a thought
    let parsed
    if (thought) {
      parsed = {
        type: 'thought' as const,
        url: `thought://${Date.now()}`,
        external_id: null,
        title: thought,
        description: null,
        thumbnail_url: null,
        embed_html: null,
      }
    } else {
      parsed = await parseURL(url!)
    }

    // Determine which table to use based on type
    const isImage = parsed.type === 'image'
    const tableName = isImage ? 'library' : 'links'

    // Get max position from the correct table
    const { data: maxPos } = await supabase
      .from(tableName)
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    // Insert into the correct table
    let tile, error

    if (isImage) {
      // Insert into library table for images
      const result = await supabase
        .from('library')
        .insert({
          serial_number: serialNumber,
          image_url: parsed.url,
          position: nextPosition,
          room_id: room_id || null,
        })
        .select()
        .single()

      tile = result.data
      error = result.error
    } else {
      // Determine if this should be a ghost tile (YouTube, Spotify)
      const isGhostDefault = ['youtube', 'spotify', 'applemusic'].includes(parsed.type)

      // Fetch oEmbed metadata for ghost tiles at creation time
      let ghostArtist: string | null = null
      let ghostThumbnailHq: string | null = null
      let ghostMediaId: string | null = parsed.external_id

      if (isGhostDefault) {
        try {
          const oembedEndpoints: Record<string, string> = {
            youtube: `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.url)}&format=json`,
            spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.url)}`,
          }
          const endpoint = oembedEndpoints[parsed.type]
          if (endpoint) {
            try {
              const res = await fetch(endpoint, { signal: AbortSignal.timeout(3000) })
              if (res.ok) {
                const data = await res.json()
                ghostArtist = data.author_name || null
                ghostThumbnailHq = data.thumbnail_url || null
                if (!ghostMediaId) ghostMediaId = parsed.external_id || null
              }
            } catch { /* silent fallback — tile still creates without metadata */ }
          }
        } catch {
          // oEmbed metadata fetch failed — proceed without metadata, not a blocker
        }
      }

      // Insert into links table for everything else
      const result = await supabase
        .from('links')
        .insert({
          serial_number: serialNumber,
          url: parsed.url,
          platform: parsed.type,
          title: parsed.title,
          metadata: {
            description: parsed.description,
            embed_html: parsed.embed_html,
          },
          thumbnail: parsed.thumbnail_url,
          position: nextPosition,
          room_id: room_id || null,
          size: ['youtube', 'vimeo'].includes(parsed.type) ? 2 : 1,
          ...(isGhostDefault ? {
            render_mode: 'ghost',
            artist: ghostArtist,
            thumbnail_url_hq: ghostThumbnailHq,
            media_id: ghostMediaId,
          } : {}),
        })
        .select()
        .single()

      tile = result.data
      error = result.error
    }

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    // Normalize response to match what edit page expects
    const normalizedTile = isImage ? {
      id: tile.id,
      url: tile.image_url,  // Library uses image_url
      type: 'image',
      title: null,
      description: null,
      thumbnail_url: null,
      embed_html: null,
      position: tile.position,
      source: tableName,
      room_id: tile.room_id || null,
    } : {
      id: tile.id,
      url: tile.url,
      type: tile.platform,
      title: tile.title,
      description: tile.metadata?.description || null,
      thumbnail_url: tile.thumbnail || null,
      embed_html: tile.metadata?.embed_html || null,
      position: tile.position,
      source: tableName,
      room_id: tile.room_id || null,
      render_mode: tile.render_mode || 'embed',
      artist: tile.artist || null,
      thumbnail_url_hq: tile.thumbnail_url_hq || null,
      media_id: tile.media_id || null,
    }

    revalidatePath(`/${slug}`)
    return NextResponse.json({ tile: normalizedTile })

  } catch (error) {
    log.error({ err: error }, 'Add tile failed')
    return NextResponse.json({ error: 'Failed to add tile' }, { status: 500 })
  }
}

/**
 * DELETE /api/tiles
 *
 * Delete a tile from either library or links table.
 * Server verifies ownership via slug before deletion.
 *
 * Body: { slug, source, id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(tilesDeleteSchema, body)
    if (!v.success) return v.response
    const { slug, source, id } = v.data

    const supabase = createServerSupabaseClient()

    const serialNumber = await getSerialNumber(request, supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Unauthorized or not found' }, { status: 403 })
    }

    // First, verify the tile exists
    const { data: existing } = await supabase
      .from(source)
      .select('id, serial_number')
      .eq('id', id)
      .single()

    // Delete from the correct table, ensuring serial_number matches
    const { error, count } = await supabase
      .from(source)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('serial_number', serialNumber)

    if (error) {
      log.error({ err: error }, 'DELETE /api/tiles: Database error')
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)
    return NextResponse.json({ success: true, deleted: count })

  } catch (error) {
    log.error({ err: error }, 'DELETE /api/tiles: Unexpected error')
    return NextResponse.json({ error: 'Failed to delete tile' }, { status: 500 })
  }
}

/**
 * PUT /api/tiles
 *
 * Batch reorder tiles.
 * Body: { slug, positions: [{ id, source, position }] }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(tilesPutSchema, body)
    if (!v.success) return v.response
    const { slug, positions } = v.data

    const supabase = createServerSupabaseClient()
    const serialNumber = await getSerialNumber(request, supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    // Group by source table for efficient updates
    const bySource: Record<string, { id: string; position: number }[]> = {}
    for (const p of positions) {
      if (!p.id || !p.source || !['library', 'links'].includes(p.source)) continue
      ;(bySource[p.source] = bySource[p.source] || []).push(p)
    }

    // Update positions per table
    const promises: PromiseLike<any>[] = []
    for (const [source, items] of Object.entries(bySource)) {
      for (const item of items) {
        promises.push(
          supabase
            .from(source)
            .update({ position: item.position })
            .eq('id', item.id)
            .eq('serial_number', serialNumber)
        )
      }
    }
    await Promise.all(promises)

    revalidatePath(`/${slug}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    log.error({ err: error }, 'Reorder tiles failed')
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}

/**
 * PATCH /api/tiles
 *
 * Update a tile's size, caption, or room_id.
 * Body: { id, source, slug, size?, caption?, room_id? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(tilesPatchSchema, body)
    if (!v.success) return v.response
    const { id, source, slug, size, caption, title, room_id, aspect } = v.data

    const supabase = createServerSupabaseClient()
    const serialNumber = await getSerialNumber(request, supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    const updates: Record<string, any> = {}
    if (size !== undefined) updates.size = size
    if (aspect !== undefined) updates.aspect = aspect
    if (caption !== undefined) updates.caption = caption || null
    if (title !== undefined) updates.title = title
    if (room_id !== undefined) updates.room_id = room_id || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from(source)
      .update(updates)
      .eq('id', id)
      .eq('serial_number', serialNumber)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    log.error({ err: error }, 'Update tile failed')
    return NextResponse.json({ error: 'Failed to update tile' }, { status: 500 })
  }
}
