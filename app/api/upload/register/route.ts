import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

// Lightweight endpoint: register a file already uploaded to Supabase Storage
// Used by client-side video uploads that bypass Vercel's body limit
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug, url, room_id, aspect } = await request.json()

    if (!slug || !url) {
      return NextResponse.json({ error: 'slug and url required' }, { status: 400 })
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

    // Get next position
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
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to register upload' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)

    const isVideo = /\.(mp4|mov|webm|m4v)($|\?)/i.test(url || '')

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
        aspect: tile.aspect || aspect || null,
      }
    })
  } catch (error) {
    console.error('Register upload error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
