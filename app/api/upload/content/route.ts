import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024  // 50MB

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES]

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const slug = formData.get('slug') as string | null
    const room_id = formData.get('room_id') as string | null

    if (!file || !slug) {
      return NextResponse.json({ error: 'file and slug required' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    const isVideo = VIDEO_TYPES.includes(file.type)
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (file.size > maxSize) {
      return NextResponse.json({
        error: `File too large. Max ${isVideo ? '50MB' : '10MB'}.`
      }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get footprint and verify ownership
    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number, user_id')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    if (footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const serialNumber = footprint.serial_number

    // 8 uploaded-video cap (only counts library rows with video extensions, not YouTube/Vimeo embeds)
    if (isVideo) {
      const { data: libraryRows } = await supabase
        .from('library')
        .select('image_url')
        .eq('serial_number', serialNumber)

      const uploadedVideoCount = (libraryRows || []).filter(row =>
        /\.(mp4|mov|webm|m4v)($|\?)/i.test(row.image_url)
      ).length

      if (uploadedVideoCount >= 8) {
        return NextResponse.json({ error: '8 video limit reached' }, { status: 400 })
      }
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
    const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Upload to storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('content')
      .upload(filename, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
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
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    revalidatePath(`/${slug}`)

    return NextResponse.json({
      tile: {
        id: tile.id,
        url: tile.image_url,
        type: 'image',
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
    console.error('Content upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
