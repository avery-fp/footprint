import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'
import { roomsPatchSchema, roomsPostSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('MULTI', '/api/rooms')

/**
 * Verify the requesting user owns the footprint with this serial_number.
 * Returns the serial_number if valid, or a NextResponse error.
 */
async function verifyOwnership(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  serialNumber: number
): Promise<{ error?: NextResponse }> {
  const userId = await getUserIdFromRequest(request)
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
  const userId = await getUserIdFromRequest(request)
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

    // Require authentication — prevents enumeration of hidden rooms
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const auth = await verifyOwnership(request, supabase, Number(serialNumber))
    if (auth.error) return auth.error

    // Mirror the public page's room filter so the owner's editor lands on
    // the same room set a visitor sees. Without .neq('hidden', true), the
    // editor could open to a hidden room with no/few tiles while public
    // lands on a visible room — producing "public has content editor
    // doesn't" without the underlying data actually diverging.
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', Number(serialNumber))
      .neq('hidden', true)
      .order('position')

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
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
 * Body: { id, slug?, hidden?, name? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(roomsPatchSchema, body)
    if (!v.success) return v.response
    const { id, slug, hidden, name, layout } = v.data

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const auth = await verifyRoomOwnership(request, supabase, id)
    if (auth.error) return auth.error

    const updates: Record<string, any> = {}
    if (typeof hidden === 'boolean') updates.hidden = hidden
    if (typeof name === 'string' && name.trim()) updates.name = name.trim()
    if (typeof layout === 'string') updates.layout = layout

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    if (slug) revalidatePath(`/${slug}`)
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
    const slug = searchParams.get('slug')

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
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    if (slug) revalidatePath(`/${slug}`)
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
    const body = await request.json()
    const v = validateBody(roomsPostSchema, body)
    if (!v.success) return v.response
    const { serial_number, name, position, slug } = v.data

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
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    if (slug) revalidatePath(`/${slug}`)
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
