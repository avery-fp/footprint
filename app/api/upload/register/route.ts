import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { mediaTypeFromUrl } from '@/lib/media'

// Files this small are virtually always corrupt video stubs (failed transcodes,
// aborted uploads). Real video files are megabytes; tiny ones produce ghost
// tiles — DB rows pointing at unplayable bytes.
const MIN_VIDEO_BYTES = 10_000
const SUPABASE_STORAGE_MARKER = 'supabase.co/storage/v1/'
// Embedded newlines/control chars in stored URLs are a known data-corruption
// pattern that produces broken <img>/<video> srcs downstream.
const CONTROL_CHARS = /[\x00-\x1F\x7F]/

// Lightweight endpoint: register a file already uploaded to Supabase Storage.
// Used by client-side video uploads that bypass Vercel's body limit.
export async function POST(request: NextRequest) {
  try {
    const { slug, url, room_id, aspect, content_type, caption, caption_hidden } = await request.json()

    if (!slug || !url) {
      return NextResponse.json({ error: 'slug and url required' }, { status: 400 })
    }

    if (typeof url !== 'string' || CONTROL_CHARS.test(url)) {
      return NextResponse.json(
        { error: 'Invalid URL: contains control characters' },
        { status: 400 }
      )
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the uploaded file actually exists and isn't a corrupt stub before
    // we write a DB row that would render as a ghost tile. Only HEAD-check
    // Supabase Storage URLs — external URLs (Mux, etc.) take their own path.
    if (url.includes(SUPABASE_STORAGE_MARKER)) {
      let head: Response
      try {
        head = await fetch(url, { method: 'HEAD', redirect: 'follow' })
      } catch (err: any) {
        return NextResponse.json(
          { error: `Upload not reachable: ${err?.message || 'network error'}` },
          { status: 400 }
        )
      }
      if (!head.ok) {
        return NextResponse.json(
          { error: `Upload not reachable: HTTP ${head.status}` },
          { status: 400 }
        )
      }

      const headType = head.headers.get('content-type') || ''
      const headLength = parseInt(head.headers.get('content-length') || '0', 10)
      const isVideo = mediaTypeFromUrl(url) === 'video'

      if (isVideo) {
        if (!headType.startsWith('video/')) {
          return NextResponse.json(
            { error: `Invalid video MIME: ${headType || 'missing'}` },
            { status: 400 }
          )
        }
        if (headLength > 0 && headLength < MIN_VIDEO_BYTES) {
          return NextResponse.json(
            { error: `Video too small (${headLength} bytes) — likely corrupt` },
            { status: 400 }
          )
        }
      }
    }

    const supabase = createServerSupabaseClient()

    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    const serialNumber = footprint.serial_number

    const { data: maxPos } = await supabase
      .from('library')
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    const { data: tile, error: insertError } = await supabase
      .from('library')
      .insert({
        serial_number: serialNumber,
        image_url: url,
        position: nextPosition,
        room_id: room_id || null,
        ...(aspect ? { aspect } : {}),
        ...(caption ? { caption } : {}),
        ...(caption_hidden !== undefined ? { caption_hidden: !!caption_hidden } : {}),
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to register upload' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)

    const canonicalType = mediaTypeFromUrl(url || '', tile.media_kind)

    return NextResponse.json({
      tile: {
        id: tile.id,
        url: tile.image_url,
        type: canonicalType,
        title: null,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tile.position,
        source: 'library',
        room_id: tile.room_id || null,
        aspect: tile.aspect || aspect || null,
        caption: tile.caption || null,
        caption_hidden: tile.caption_hidden ?? false,
      }
    })
  } catch (error) {
    console.error('Register upload error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
