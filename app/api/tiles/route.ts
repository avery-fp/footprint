import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'

/**
 * Get serial_number from slug + verify the requesting user owns it.
 * Returns null if not found or not owned.
 */
async function getSerialNumber(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  slug: string
): Promise<number | null> {
  const userId = request.headers.get('x-user-id')
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
    const { slug, url, thought, room_id } = await request.json()

    if (!slug || (!url && !thought)) {
      return NextResponse.json({ error: 'slug and (url or thought) required' }, { status: 400 })
    }

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
      parsed = await parseURL(url)
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
        })
        .select()
        .single()

      tile = result.data
      error = result.error
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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
    }

    return NextResponse.json({ tile: normalizedTile })

  } catch (error) {
    console.error('Add tile error:', error)
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
    const { slug, source, id } = await request.json()

    if (!slug || !source || !id || !['library', 'links'].includes(source)) {
      console.error('DELETE /api/tiles: Missing or invalid params', { slug, source, id })
      return NextResponse.json({ error: 'slug, source (library|links), and id required' }, { status: 400 })
    }

    console.log('DELETE /api/tiles:', { slug, source, id, idType: typeof id })

    const supabase = createServerSupabaseClient()

    const serialNumber = await getSerialNumber(request, supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Unauthorized or not found' }, { status: 403 })
    }

    console.log('DELETE /api/tiles: Found footprint, serial_number:', serialNumber)

    // First, verify the tile exists
    const { data: existing } = await supabase
      .from(source)
      .select('id, serial_number')
      .eq('id', id)
      .single()

    console.log('DELETE /api/tiles: Existing tile check:', existing)

    // Delete from the correct table, ensuring serial_number matches
    const { error, count } = await supabase
      .from(source)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('serial_number', serialNumber)

    if (error) {
      console.error('DELETE /api/tiles: Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`DELETE /api/tiles: Deleted ${count} row(s) from ${source} table. Tile ID: ${id}`)

    return NextResponse.json({ success: true, deleted: count })

  } catch (error) {
    console.error('DELETE /api/tiles: Unexpected error:', error)
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
    const { slug, positions } = await request.json()

    if (!slug || !Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ error: 'slug and positions array required' }, { status: 400 })
    }

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
    const promises: Promise<any>[] = []
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reorder tiles error:', error)
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}

/**
 * PATCH /api/tiles
 *
 * Update a tile's size or caption.
 * Body: { id, source, slug, size? , caption? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { id, source, slug, size, caption } = await request.json()

    if (!id || !source || !slug || !['library', 'links'].includes(source)) {
      return NextResponse.json({ error: 'id, source, and slug required' }, { status: 400 })
    }

    if (size !== undefined && ![1, 2, 3].includes(size)) {
      return NextResponse.json({ error: 'size must be 1, 2, or 3' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const serialNumber = await getSerialNumber(request, supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    const updates: Record<string, any> = {}
    if (size !== undefined) updates.size = size
    if (caption !== undefined) updates.caption = caption || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from(source)
      .update(updates)
      .eq('id', id)
      .eq('serial_number', serialNumber)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update tile error:', error)
    return NextResponse.json({ error: 'Failed to update tile' }, { status: 500 })
  }
}
