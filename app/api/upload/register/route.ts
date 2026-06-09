import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { mediaTypeFromUrl } from '@/lib/media'
import { headWithRetry } from '@/lib/upload-verify'
import {
  getVideoUploadTooLargeCopy,
  getVideoUploadTooLongCopy,
  isAcceptedVideoDurationSeconds,
  isAcceptedVideoSize,
} from '@/lib/upload-validation'

// Files this small are virtually always corrupt video stubs (failed transcodes,
// aborted uploads). Real video files are megabytes; tiny ones produce ghost
// tiles — DB rows pointing at unplayable bytes.
const MIN_VIDEO_BYTES = 10_000
const SUPABASE_STORAGE_MARKER = 'supabase.co/storage/v1/'
// Embedded newlines/control chars in stored URLs are a known data-corruption
// pattern that produces broken <img>/<video> srcs downstream.
const CONTROL_CHARS = /[\x00-\x1F\x7F]/
const PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/'
const PUBLIC_RENDER_PREFIX = '/storage/v1/render/image/public/'

function buildPublicPosterDerivativeUrl(publicUrl: string) {
  const clean = publicUrl.replace(/[\n\r]/g, '').trim()
  if (!clean.includes(PUBLIC_OBJECT_PREFIX)) return null
  const base = clean.split('?')[0]
  return `${base.replace(PUBLIC_OBJECT_PREFIX, PUBLIC_RENDER_PREFIX)}?width=512&quality=70`
}

async function createImagePosterDerivative(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  sourcePublicUrl: string,
  serialNumber: string
) {
  const renderUrl = buildPublicPosterDerivativeUrl(sourcePublicUrl)
  if (!renderUrl) return null

  const response = await fetch(renderUrl)
  if (!response.ok) return null

  const bytes = Buffer.from(await response.arrayBuffer())
  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg'
  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
    ? 'webp'
    : 'jpg'
  const posterPath = `${serialNumber}/posters/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from('content')
    .upload(posterPath, bytes, { contentType, upsert: false })

  if (error) return null

  const { data: posterUrlData } = supabase.storage.from('content').getPublicUrl(posterPath)
  return posterUrlData.publicUrl.replace(/[\n\r]/g, '')
}

// Lightweight endpoint: register a file already uploaded to Supabase Storage.
// Used by client-side video uploads that bypass Vercel's body limit.
export async function POST(request: NextRequest) {
  try {
    const { slug, url, room_id, parent_tile_id, aspect, content_type, caption, caption_hidden, size, duration_seconds } = await request.json()

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
        // Retry HEAD with short backoff: Supabase's public CDN can lag the
        // upload PUT by a few hundred ms. A single 404 here would reject
        // every otherwise-valid upload during the propagation tail.
        head = await headWithRetry(url)
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
        if (!isAcceptedVideoSize(headLength)) {
          return NextResponse.json(
            { error: getVideoUploadTooLargeCopy() },
            { status: 400 }
          )
        }
        if (typeof duration_seconds === 'number' && !isAcceptedVideoDurationSeconds(duration_seconds)) {
          return NextResponse.json(
            { error: getVideoUploadTooLongCopy() },
            { status: 400 }
          )
        }
      }
    }

    const supabase = createServerSupabaseClient()
    const mediaType = mediaTypeFromUrl(url)
    const isImage = mediaType === 'image' || (typeof content_type === 'string' && content_type.startsWith('image/'))
    const isVideo = mediaType === 'video'

    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    const serialNumber = footprint.serial_number

    if (parent_tile_id) {
      const { data: container } = await supabase
        .from('links')
        .select('id')
        .eq('id', parent_tile_id)
        .eq('serial_number', serialNumber)
        .eq('platform', 'container')
        .single()
      if (!container) {
        return NextResponse.json({ error: 'Container not found' }, { status: 404 })
      }
    }

    const [{ data: libMax }, { data: linkMax }] = parent_tile_id
      ? await Promise.all([
          supabase
            .from('library')
            .select('position')
            .eq('serial_number', serialNumber)
            .eq('parent_tile_id', parent_tile_id)
            .order('position', { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from('links')
            .select('position')
            .eq('serial_number', serialNumber)
            .eq('parent_tile_id', parent_tile_id)
            .order('position', { ascending: false })
            .limit(1)
            .single(),
        ])
      : await Promise.all([
          supabase
            .from('library')
            .select('position')
            .eq('serial_number', serialNumber)
            .order('position', { ascending: false })
            .limit(1)
            .single(),
          Promise.resolve({ data: null }),
        ])

    const nextPosition = Math.max(libMax?.position ?? -1, linkMax?.position ?? -1) + 1

    // Resting state is S. Aspect carries differentiation; size inflation is
    // an editorial pick, not ambient default. Users explicitly promote to
    // M/L via the editor.
    const resolvedSize = (size === 1 || size === 2 || size === 3) ? size : 1

    const publicPosterUrl = !isVideo && isImage ? await createImagePosterDerivative(supabase, url, serialNumber) : null

    const { data: tile, error: insertError } = await supabase
      .from('library')
      .insert({
        serial_number: serialNumber,
        image_url: url,
        ...(publicPosterUrl ? { public_poster_url: publicPosterUrl } : {}),
        position: nextPosition,
        room_id: parent_tile_id ? null : (room_id || null),
        parent_tile_id: parent_tile_id || null,
        size: resolvedSize,
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
        public_poster_url: tile.public_poster_url || publicPosterUrl || null,
        type: canonicalType,
        title: null,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tile.position,
        source: 'library',
        room_id: tile.room_id || null,
        parent_tile_id: tile.parent_tile_id || null,
        size: tile.size ?? resolvedSize ?? 1,
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
