import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { nanoid } from 'nanoid'

/**
 * GET /api/rooms
 * 
 * Fetches all footprints (rooms) for the authenticated user.
 * Returns them ordered with primary first, then by creation date.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { data: rooms, error } = await supabase
      .from('footprints')
      .select('*, content(count)')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform to include content count
    const roomsWithCount = rooms.map(room => ({
      ...room,
      content_count: room.content?.[0]?.count || 0,
    }))

    return NextResponse.json({ rooms: roomsWithCount })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
  }
}

/**
 * POST /api/rooms
 * 
 * Creates a new footprint (room) for the user.
 * 
 * Users can have unlimited rooms - that's the point.
 * Music room, work room, chaos room, whatever they want.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, icon } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get user's serial number for the slug
    const { data: user } = await supabase
      .from('users')
      .select('serial_number')
      .eq('id', userId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Generate slug: fp-{serial}-{random}
    const slug = `fp-${user.serial_number}-${nanoid(6).toLowerCase()}`

    // Create the room
    const { data: room, error } = await supabase
      .from('footprints')
      .insert({
        user_id: userId,
        slug,
        name,
        icon: icon || '◈',
        is_primary: false,
        is_public: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ room })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}

/**
 * PUT /api/rooms
 * 
 * Updates a footprint's metadata (name, icon, profile info).
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Room id required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const { data: existing } = await supabase
      .from('footprints')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== userId) {
      return NextResponse.json({ error: 'Not your room' }, { status: 403 })
    }

    // Update
    const { data: room, error } = await supabase
      .from('footprints')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ room })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to update room' }, { status: 500 })
  }
}

/**
 * DELETE /api/rooms?id=xxx
 * 
 * Deletes a footprint. Cannot delete the primary footprint.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('id')

    if (!roomId) {
      return NextResponse.json({ error: 'Room id required' }, { status: 400 })
    }

    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership and check if primary
    const { data: room } = await supabase
      .from('footprints')
      .select('user_id, is_primary')
      .eq('id', roomId)
      .single()

    if (!room || room.user_id !== userId) {
      return NextResponse.json({ error: 'Not your room' }, { status: 403 })
    }

    if (room.is_primary) {
      return NextResponse.json(
        { error: 'Cannot delete your primary footprint' },
        { status: 400 }
      )
    }

    // Delete (cascade will handle content)
    const { error } = await supabase
      .from('footprints')
      .delete()
      .eq('id', roomId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 })
  }
}
