import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { mediaTypeFromUrl } from '@/lib/media'
import { headWithRetry } from '@/lib/upload-verify'

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
    // [DIAG] stage 4 entry — log everything we received
    console.log('[DIAG] STAGE4_REGISTER_IN', {
      slug, url, room_id, aspect, content_type,
      hasCaption: !!caption, hasCookieHeader: !!request.headers.get('cookie'),
    })

    if (!slug || !url) {
      console.error('[DIAG] STAGE4_REJECT_MISSING_FIELDS', { hasSlug: !!slug, hasUrl: !!url })
      return NextResponse.json({ error: 'slug and url required' }, { status: 400 })
    }

    if (typeof url !== 'string' || CONTROL_CHARS.test(url)) {
      console.error('[DIAG] STAGE4_REJECT_BAD_URL', { url })
      return NextResponse.json(
        { error: 'Invalid URL: contains control characters' },
        { status: 400 }
      )
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      console.error('[DIAG] STAGE4_REJECT_AUTH', { slug, authReason: (auth as any).reason })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the uploaded file actually exists and isn't a corrupt stub before
    // we write a DB row that would render as a ghost tile. Only HEAD-check
    // Supabase Storage URLs — external URLs (Mux, etc.) take their own path.
    if (url.includes(SUPABASE_STORAGE_MARKER)) {
      let head: Response
      try {
        // Retry HEAD with short backoff: Supabase's public CDN can lag the
        // upload PUT by a few hundred ms. A single 404 here would reject
        // every otherwise-valid upload during the propagation tail.
        head = await headWithRetry(url)
      } catch (err: any) {
        console.error('[DIAG] STAGE4_HEAD_THREW', { url, err: err?.message })
        return NextResponse.json(
          { error: `Upload not reachable: ${err?.message || 'network error'}` },
          { status: 400 }
        )
      }
      // [DIAG] log HEAD result regardless of pass/fail
      console.log('[DIAG] STAGE4_HEAD_RESULT', {
        url, status: head.status, ok: head.ok,
        contentType: head.headers.get('content-type'),
        contentLength: head.headers.get('content-length'),
      })
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
          console.error('[DIAG] STAGE4_REJECT_VIDEO_MIME', { headType, url })
          return NextResponse.json(
            { error: `Invalid video MIME: ${headType || 'missing'}` },
            { status: 400 }
          )
        }
        if (headLength > 0 && headLength < MIN_VIDEO_BYTES) {
          console.error('[DIAG] STAGE4_REJECT_VIDEO_SIZE', { headLength, url })
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
      console.error('[DIAG] STAGE4_FOOTPRINT_NOT_FOUND', { slug })
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
      console.error('[DIAG] STAGE4_DB_INSERT_FAIL', {
        slug, serialNumber, code: insertError.code, message: insertError.message,
        details: insertError.details, hint: insertError.hint,
      })
      return NextResponse.json({ error: 'Failed to register upload' }, { status: 500 })
    }
    console.log('[DIAG] STAGE4_DB_INSERT_OK', { tileId: tile.id, position: tile.position })

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
