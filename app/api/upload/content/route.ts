import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024  // 50MB

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
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

    // Get serial_number from slug
    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    const serialNumber = footprint.serial_number

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

    // Get public URL
    const { data: urlData } = supabase.storage.from('content').getPublicUrl(filename)
    const publicUrl = urlData.publicUrl

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
        title: file.name,
        description: null,
        position: nextPosition,
        room_id: room_id || null,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      tile: {
        id: tile.id,
        url: tile.image_url,
        type: 'image',
        title: tile.title,
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
