import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'
import { getVideoProvider } from '@/lib/video-providers'

/**
 * POST /api/upload/video
 *
 * Creates a direct upload session with the video provider (Mux).
 * Client uploads the raw file directly to the provider URL —
 * the file never passes through our server.
 *
 * Body: { slug, aspect?, room_id? }
 * Returns: { uploadUrl, tileId, assetId }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug, aspect, room_id } = await request.json()

    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
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

    // Create provider upload session
    const provider = getVideoProvider()
    const session = await provider.createUploadSession()

    // Get next position
    const { data: maxPos } = await supabase
      .from('library')
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    // Insert library row immediately (status='uploading')
    const { data: tile, error: insertError } = await supabase
      .from('library')
      .insert({
        serial_number: serialNumber,
        image_url: '',
        media_kind: 'video',
        provider: process.env.VIDEO_PROVIDER || 'mux',
        asset_id: session.assetId,
        status: 'uploading',
        position: nextPosition,
        room_id: room_id || null,
        ...(aspect ? { aspect } : {}),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Video tile insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create video tile' }, { status: 500 })
    }

    return NextResponse.json({
      uploadUrl: session.uploadUrl,
      tileId: tile.id,
      assetId: session.assetId,
    })
  } catch (error) {
    console.error('Video upload session error:', error)
    return NextResponse.json({ error: 'Failed to create upload session' }, { status: 500 })
  }
}
