import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getTheme } from '@/lib/themes'

/**
 * GET /api/aro/remix-data?slug=ae&room=nba-allstar
 *
 * Returns room content for the remix flow. Public endpoint (no auth).
 * Used by the /remix/[slug] page to show a preview + "Make yours" CTA.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    const roomName = searchParams.get('room')

    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get footprint
    const { data: footprint } = await supabase
      .from('footprints')
      .select('*')
      .eq('username', slug)
      .eq('published', true)
      .single()

    if (!footprint) {
      return NextResponse.json(
        { error: 'Footprint not found' },
        { status: 404 }
      )
    }

    const serialNumber = footprint.serial_number

    // Get room if specified
    let room = null
    if (roomName) {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('serial_number', serialNumber)
        .eq('name', roomName)
        .neq('hidden', true)
        .single()

      room = roomData
    }

    // Get content (from specific room or all)
    const [{ data: images }, { data: links }] = await Promise.all([
      room
        ? supabase
            .from('library')
            .select('image_url, position, size')
            .eq('serial_number', serialNumber)
            .eq('room_id', room.id)
            .order('position')
        : supabase
            .from('library')
            .select('image_url, position, size')
            .eq('serial_number', serialNumber)
            .order('position')
            .limit(20),
      room
        ? supabase
            .from('links')
            .select('url, platform, title, thumbnail, metadata, position, size')
            .eq('serial_number', serialNumber)
            .eq('room_id', room.id)
            .order('position')
        : supabase
            .from('links')
            .select('url, platform, title, thumbnail, metadata, position, size')
            .eq('serial_number', serialNumber)
            .order('position')
            .limit(20),
    ])

    const theme = getTheme(footprint.dimension || 'midnight')

    return NextResponse.json({
      footprint: {
        slug: footprint.username,
        display_name: footprint.display_name,
        bio: footprint.bio,
        serial_number: serialNumber,
        theme_id: footprint.dimension || 'midnight',
      },
      room: room
        ? { id: room.id, name: room.name }
        : null,
      content: {
        image_urls: (images || []).map((img: any) => img.image_url),
        embed_urls: (links || []).map((link: any) => link.url),
        tiles: [
          ...(images || []).map((img: any) => ({
            type: 'image',
            url: img.image_url,
            position: img.position,
            size: img.size || 1,
          })),
          ...(links || []).map((link: any) => ({
            type: link.platform,
            url: link.url,
            title: link.title,
            thumbnail: link.thumbnail,
            embed_html: link.metadata?.embed_html,
            position: link.position,
            size: link.size || 1,
          })),
        ].sort((a, b) => a.position - b.position),
      },
      theme: {
        id: theme.id,
        name: theme.name,
        colors: theme.colors,
      },
    })
  } catch (error: any) {
    console.error('Remix data error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch remix data' },
      { status: 500 }
    )
  }
}
