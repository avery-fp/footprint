import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Verify the requesting user owns the footprint with this serial_number.
 * Returns the serial_number if valid, or a NextResponse error.
 */
async function verifyOwnership(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  serialNumber: number
): Promise<{ error?: NextResponse }> {
  const userId = request.headers.get('x-user-id')
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: footprint } = await supabase
    .from('footprints')
    .select('user_id')
    .eq('serial_number', serialNumber)
    .single()

  if (!footprint || footprint.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return {}
}

/**
 * Look up a room and verify the requesting user owns it.
 */
async function verifyRoomOwnership(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  roomId: string
): Promise<{ error?: NextResponse; serialNumber?: number }> {
  const userId = request.headers.get('x-user-id')
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // Get the room's serial_number
  const { data: room } = await supabase
    .from('rooms')
    .select('serial_number')
    .eq('id', roomId)
    .single()

  if (!room) {
    return { error: NextResponse.json({ error: 'Room not found' }, { status: 404 }) }
  }

  // Verify the user owns the footprint with this serial_number
  const { data: footprint } = await supabase
    .from('footprints')
    .select('user_id')
    .eq('serial_number', room.serial_number)
    .single()

  if (!footprint || footprint.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { serialNumber: room.serial_number }
}

/**
 * GET /api/rooms?serial_number=123
 *
 * Fetch rooms for a footprint by serial_number.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const serialNumber = searchParams.get('serial_number')

    if (!serialNumber) {
      return NextResponse.json({ error: 'serial_number required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', Number(serialNumber))
      .order('position')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rooms: rooms || [] })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
  }
}

/**
 * PATCH /api/rooms
 *
 * Update room properties (hidden, name).
 * Body: { id, hidden?, name? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { id, hidden, name } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const auth = await verifyRoomOwnership(request, supabase, id)
    if (auth.error) return auth.error

    const updates: Record<string, any> = {}
    if (typeof hidden === 'boolean') updates.hidden = hidden
    if (typeof name === 'string' && name.trim()) updates.name = name.trim()

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update room' }, { status: 500 })
  }
}

/**
 * DELETE /api/rooms?id=xxx
 *
 * Permanently delete a room and unassign its content.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const auth = await verifyRoomOwnership(request, supabase, id)
    if (auth.error) return auth.error

    // Unassign tiles from this room (move to unassigned, don't delete them)
    await supabase.from('library').update({ room_id: null }).eq('room_id', id)
    await supabase.from('links').update({ room_id: null }).eq('room_id', id)
    // Delete room
    const { error } = await supabase.from('rooms').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 })
  }
}

/**
 * POST /api/rooms
 *
 * Create a new room.
 * Body: { serial_number, name, position }
 */
export async function POST(request: NextRequest) {
  try {
    const { serial_number, name, position } = await request.json()

    if (!serial_number || !name) {
      return NextResponse.json({ error: 'serial_number and name required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const auth = await verifyOwnership(request, supabase, serial_number)
    if (auth.error) return auth.error

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        serial_number,
        name,
        position: position ?? 0,
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
