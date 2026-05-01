import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/upload/content')

const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024  // 50MB

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/mov', 'video/3gpp', 'video/3gpp2', 'video/x-matroska']
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES]

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const slug = formData.get('slug') as string | null
    const room_id = formData.get('room_id') as string | null

    if (!file || !slug) {
      return NextResponse.json({ error: 'file and slug required' }, { status: 400 })
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'We support JPG, PNG, GIF, WebP, MP4, MOV, and WebM.' }, { status: 400 })
    }

    const isVideo = VIDEO_TYPES.includes(file.type)
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (file.size > maxSize) {
      return NextResponse.json({ error: isVideo ? 'Videos under 50MB.' : 'Images under 10MB.' }, { status: 400 })
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

    // Generate unique filename — derive extension from MIME type for videos
    // so a video/mp4 file named "clip.jpg" gets stored as .mp4, not .jpg.
    const VIDEO_MIME_EXT: Record<string, string> = {
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
      'video/x-m4v': 'm4v', 'video/mov': 'mov', 'video/3gpp': '3gp',
      'video/3gpp2': '3gp', 'video/x-matroska': 'mkv',
    }
    const ext = (isVideo && VIDEO_MIME_EXT[file.type]) || file.name.split('.').pop() || 'jpg'
    const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Upload to storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('content')
      .upload(filename, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      log.error({ err: uploadError }, 'Upload failed')
      return NextResponse.json({ error: 'Upload hiccuped. Try again.' }, { status: 500 })
    }

    // Get public URL (sanitize — Supabase sometimes injects newlines)
    const { data: urlData } = supabase.storage.from('content').getPublicUrl(filename)
    const publicUrl = urlData.publicUrl.replace(/[\n\r]/g, '')

    // Get next position
    const { data: maxPos } = await supabase
      .from('library')
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    // Insert into library table
    const { data: tile, error: insertError } = await supabase
      .from('library')
      .insert({
        serial_number: serialNumber,
        image_url: publicUrl,
        position: nextPosition,
        room_id: room_id || null,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save content' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)

    return NextResponse.json({
      tile: {
        id: tile.id,
        url: tile.image_url,
        type: isVideo ? 'video' : 'image',
        title: null,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tile.position,
        source: 'library',
        room_id: tile.room_id || null,
      }
    })
  } catch (error) {
    log.error({ err: error }, 'Content upload failed')
    return NextResponse.json({ error: 'Upload hiccuped. Try again.' }, { status: 500 })
  }
}
