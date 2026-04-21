import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'
import { getEditAuth } from '@/lib/edit-auth'
import { tilesPostSchema, tilesDeleteSchema, tilesPutSchema, tilesPatchSchema, containerPostSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'
import { detectProvider } from '@/lib/media/detectProvider'
import { PROVIDER_RENDER_DEFAULTS, contentTypeToKind, contentTypeToProvider } from '@/lib/media/types'

const log = routeLogger('MULTI', '/api/tiles')

/**
 * Verify the request carries a valid edit_token for `slug` and return the
 * footprint's serial_number. Returns null if auth fails or the slug is
 * unknown.
 */
async function getSerialNumber(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  slug: string
): Promise<number | null> {
  const auth = await getEditAuth(request, slug)
  if (!auth.ok) return null

  const { data: footprint } = await supabase
    .from('footprints')
    .select('serial_number')
    .eq('username', slug)
    .single()

  return footprint?.serial_number ?? null
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
      // Strip embedded whitespace — supabase.storage.getPublicUrl() has been
      // observed to occasionally include a stray '\n' between the host and
      // the path, which silently breaks <img src> in strict parsers and
      // makes our isCachedThumbnail() check fail. cache-thumbnail.ts:81
      // already does this for cached thumbs; we apply the same guard here
      // for direct-image uploads. (See improvements-audit-2026-04-15.md item 6.)
      const cleanImageUrl = (parsed.url || '').replace(/[\n\r]+/g, '').trim()
      const result = await supabase
        .from('library')
        .insert({
          serial_number: serialNumber,
          image_url: cleanImageUrl,
          position: nextPosition,
          room_id: room_id || null,
        })
        .select()
        .single()

      tile = result.data
      error = result.error
    } else {
      // Determine if this needs metadata enrichment at save time
      const needsEnrich = ['youtube', 'spotify', 'twitter', 'tiktok', 'instagram', 'vimeo', 'soundcloud', 'bandcamp', 'github', 'letterboxd'].includes(parsed.type)

      // Fetch oEmbed / OG metadata at creation time
      let ghostArtist: string | null = null
      let ghostThumbnailHq: string | null = null
      let ghostMediaId: string | null = parsed.external_id
      let enrichedTitle: string | null = null

      if (needsEnrich) {
        try {
          const browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          }

          // Instagram: scrape og:image directly (no public oEmbed)
          if (parsed.type === 'instagram') {
            // Strategy 1: Direct OG scrape
            try {
              const res = await fetch(parsed.url, {
                signal: AbortSignal.timeout(5000),
                headers: browserHeaders,
                redirect: 'follow',
              })
              if (res.ok) {
                const html = await res.text()
                const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
                  || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
                if (ogImage) ghostThumbnailHq = ogImage
                const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
                  || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1]
                if (ogTitle) enrichedTitle = ogTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
              }
            } catch { /* silent fallback */ }

            // Strategy 2: Embed page scrape if OG failed
            if (!ghostThumbnailHq && parsed.external_id) {
              try {
                const embedRes = await fetch(`https://www.instagram.com/p/${parsed.external_id}/embed/`, {
                  signal: AbortSignal.timeout(5000),
                  headers: browserHeaders,
                  redirect: 'follow',
                })
                if (embedRes.ok) {
                  const embedHtml = await embedRes.text()
                  const imgMatch = embedHtml.match(/"display_url"\s*:\s*"([^"]+)"/)?.[1]
                    || embedHtml.match(/<img[^>]*src="(https:\/\/[^"]*instagram[^"]*\.jpg[^"]*)"/i)?.[1]
                  if (imgMatch) {
                    ghostThumbnailHq = imgMatch.replace(/\\u0026/g, '&').replace(/\\/g, '')
                  }
                }
              } catch { /* silent */ }
            }
          } else {
            // oEmbed for YouTube, Spotify, Twitter, TikTok
            const oembedEndpoints: Record<string, string> = {
              youtube: `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.url)}&format=json`,
              spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.url)}`,
              twitter: `https://publish.twitter.com/oembed?url=${encodeURIComponent(parsed.url)}&omit_script=true&dnt=true`,
              tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.url)}`,
              vimeo: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.url)}`,
              soundcloud: `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(parsed.url)}`,
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

                  // Twitter: extract tweet text from oEmbed html field
                  if (parsed.type === 'twitter' && data.html) {
                    const pMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/)
                    if (pMatch) {
                      enrichedTitle = pMatch[1].replace(/<[^>]+>/g, '').trim() || null
                    }
                  }

                  // TikTok: use oEmbed title
                  if (parsed.type === 'tiktok' && data.title) {
                    enrichedTitle = data.title
                  }
                }
              } catch { /* silent fallback — tile still creates without metadata */ }
            }

            // Twitter: oEmbed has no thumbnail — fetch OG image from tweet page
            if (parsed.type === 'twitter' && !ghostThumbnailHq) {
              try {
                const pageRes = await fetch(parsed.url, {
                  signal: AbortSignal.timeout(5000),
                  headers: browserHeaders,
                  redirect: 'follow',
                })
                if (pageRes.ok) {
                  const html = await pageRes.text()
                  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
                    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
                    || html.match(/<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i)?.[1]
                    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i)?.[1]
                  if (ogImage && !ogImage.includes('profile_images')) {
                    ghostThumbnailHq = ogImage
                  }
                }
              } catch { /* silent */ }
            }

            // Bandcamp, GitHub, Letterboxd: OG scrape for thumbnail + title
            if (['bandcamp', 'github', 'letterboxd'].includes(parsed.type)) {
              try {
                const pageRes = await fetch(parsed.url, {
                  signal: AbortSignal.timeout(5000),
                  headers: browserHeaders,
                  redirect: 'follow',
                })
                if (pageRes.ok) {
                  const html = await pageRes.text()
                  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
                    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
                  if (ogImage) ghostThumbnailHq = ogImage
                  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
                    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1]
                  if (ogTitle) enrichedTitle = ogTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1]
                    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1]
                  if (ogDesc) ghostArtist = ogDesc.slice(0, 100)
                }
              } catch { /* silent */ }
            }
          }
        } catch {
          // Metadata fetch failed — proceed without metadata, not a blocker
        }

        if (parsed.type === 'youtube') {
          ghostThumbnailHq = parsed.thumbnail_url || ghostThumbnailHq

          // YouTube clip normalization: /clip/ URLs don't contain the video ID.
          // Scrape the page to extract parent videoId + clip start/end times.
          // The clip ID captured by the parser regex won't match the 11-char
          // video ID format, so ghostMediaId will be null — we detect that.
          if (/youtube\.com\/clip\//.test(parsed.url) && !ghostMediaId?.match(/^[a-zA-Z0-9_-]{11}$/)) {
            try {
              const clipRes = await fetch(parsed.url, {
                signal: AbortSignal.timeout(7000),
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                redirect: 'follow',
              })
              if (clipRes.ok) {
                const clipHtml = await clipRes.text()
                const parentVid = clipHtml.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/)?.[1]
                if (parentVid) ghostMediaId = parentVid
                const startMs = clipHtml.match(/"startTimeMs"\s*:\s*"(\d+)"/)?.[1]
                const endMs = clipHtml.match(/"endTimeMs"\s*:\s*"(\d+)"/)?.[1]
                if (startMs || endMs) {
                  // Store clip range in metadata (plucked onto item by page.tsx)
                  ;(parsed as any)._clipMeta = {
                    clip_start_ms: startMs ? parseInt(startMs, 10) : undefined,
                    clip_end_ms: endMs ? parseInt(endMs, 10) : undefined,
                  }
                }
                // Also grab a proper thumbnail from the parent video
                if (parentVid && !ghostThumbnailHq) {
                  ghostThumbnailHq = `https://i.ytimg.com/vi/${parentVid}/maxresdefault.jpg`
                }
                // And a title from OG if the oEmbed didn't resolve one
                if (!enrichedTitle) {
                  const ogTitle = clipHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
                  if (ogTitle) enrichedTitle = ogTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                }
              }
            } catch { /* clip scrape failed — tile still creates, just without clip range */ }
          }
        }

        // Cache social thumbnails to permanent Supabase Storage
        if (ghostThumbnailHq && needsEnrich && !['youtube', 'tiktok'].includes(parsed.type)) {
          const { cacheThumbnail } = await import('@/lib/media/cache-thumbnail')
          const cached = await cacheThumbnail(ghostThumbnailHq, parsed.url, serialNumber)
          if (cached) ghostThumbnailHq = cached
        }
      }

      // Compute identity layer fields
      const identityProvider = detectProvider(parsed.url)
      const identityKind = contentTypeToKind(parsed.type)
      const identityRenderMode = PROVIDER_RENDER_DEFAULTS[identityProvider]?.preferredMode || 'link_only'

      // Insert into links table for everything else
      const result = await supabase
        .from('links')
        .insert({
          serial_number: serialNumber,
          url: parsed.url,
          platform: parsed.type,
          title: enrichedTitle || parsed.title,
          metadata: {
            description: parsed.description,
            embed_html: parsed.embed_html,
            kind: identityKind,
            provider: identityProvider,
            ...((parsed as any)._clipMeta || {}),
          },
          thumbnail: parsed.thumbnail_url,
          position: nextPosition,
          room_id: room_id || null,
          // Peak convention: videos get M (need 16:9 room), everything else
          // starts S. User resizes individual tiles in edit mode. Flat defaults
          // kill the grid's visual rhythm — don't go back there.
          size: ['youtube', 'vimeo'].includes(parsed.type) ? 2 : 1,
          ...(needsEnrich ? {
            render_mode: 'ghost',
            artist: ghostArtist,
            thumbnail_url_hq: ghostThumbnailHq,
            media_id: ghostMediaId,
          } : {
            render_mode: identityRenderMode,
          }),
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

    // Cascade: any row with parent_tile_id = this id is a child of this tile
    // (container children live in either table). Schema has no FK on
    // parent_tile_id, so without this step deleting a container leaves its
    // children orphaned in the DB — invisible everywhere but accumulating
    // forever. Delete them in parallel before the parent.
    await Promise.all([
      supabase.from('library').delete().eq('parent_tile_id', id).eq('serial_number', serialNumber),
      supabase.from('links').delete().eq('parent_tile_id', id).eq('serial_number', serialNumber),
    ])

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

    // count === 0 means the row didn't match — stale tileSources entry,
    // serial mismatch, double-tap race, or concurrent tab already deleted.
    // Reporting success here is the zombie generator: client removes the
    // tile locally, DB still has the row, next reload brings it back.
    // Surface a real failure so the client can refetch and reconcile.
    if (count === 0) {
      return NextResponse.json(
        { error: 'Tile not found or already deleted', code: 'not_found' },
        { status: 404 }
      )
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
    const { id, source, slug, size, caption, title, room_id, aspect, parent_tile_id } = v.data

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
    if (parent_tile_id !== undefined) updates.parent_tile_id = parent_tile_id || null

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
