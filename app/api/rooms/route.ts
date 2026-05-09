import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { roomsPatchSchema, roomsPostSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('MULTI', '/api/rooms')

/**
 * Resolve a serial_number to its slug, then verify edit_token for that slug.
 */
async function verifyBySerial(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  serialNumber: number
): Promise<{ error?: NextResponse; slug?: string }> {
  const { data: footprint } = await supabase
    .from('footprints')
    .select('username')
    .eq('serial_number', serialNumber)
    .single()

  if (!footprint?.username) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const auth = await getEditAuth(request, footprint.username)
  if (!auth.ok) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { slug: footprint.username }
}

/**
 * Resolve a room_id to its footprint slug, then verify edit_token.
 */
async function verifyByRoomId(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  roomId: string
): Promise<{ error?: NextResponse; slug?: string; serialNumber?: number }> {
  const { data: room } = await supabase
    .from('rooms')
    .select('serial_number')
    .eq('id', roomId)
    .single()

  if (!room) {
    return { error: NextResponse.json({ error: 'Room not found' }, { status: 404 }) }
  }

  const { slug, error } = await verifyBySerial(request, supabase, room.serial_number)
  if (error) return { error }
  return { slug, serialNumber: room.serial_number }
}

/**
 * GET /api/rooms?serial_number=123
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const serialNumber = searchParams.get('serial_number')

    if (!serialNumber) {
      return NextResponse.json({ error: 'serial_number required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const auth = await verifyBySerial(request, supabase, Number(serialNumber))
    if (auth.error) return auth.error

    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', Number(serialNumber))
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
 * Body: { id, slug?, name?, layout?, position?, is_locked?, passcode? }
 *
 * Privacy contract:
 *  - is_locked: true  + passcode set → bcrypt the passcode and store as hash.
 *  - is_locked: true  + passcode omitted → flip flag only (re-lock with the
 *    existing hash). Useful when toggling a previously-locked room back on.
 *  - is_locked: false → drop the hash. Owner is removing protection, not
 *    adding it; we never carry a hash on a public room.
 *  - passcode without is_locked === true is rejected: setting a code on a
 *    public room is meaningless and almost certainly a UI bug.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(roomsPatchSchema, body)
    if (!v.success) return v.response
    const { id, slug, name, layout, position, is_locked, passcode } = v.data

    const supabase = createServerSupabaseClient()

    const auth = await verifyByRoomId(request, supabase, id)
    if (auth.error) return auth.error

    const updates: Record<string, any> = {}
    if (typeof name === 'string' && name.trim()) updates.name = name.trim()
    if (typeof layout === 'string') {
      // Normalize legacy values forward so the DB only ever stores the new
      // vocabulary going forward. Reads still self-heal in loadFootprint
      // for any rows that already carry stale layout values.
      updates.layout =
        layout === 'rail' ? 'horizontal' :
        layout === 'mix' || layout === 'editorial' ? 'grid' :
        layout
    }
    if (typeof position === 'number') updates.position = position

    if (typeof is_locked === 'boolean') {
      updates.is_locked = is_locked
      if (is_locked) {
        if (typeof passcode === 'string') {
          updates.passcode_hash = await bcrypt.hash(passcode, 10)
        }
      } else {
        updates.passcode_hash = null
      }
    } else if (typeof passcode === 'string') {
      return NextResponse.json(
        { error: 'passcode requires is_locked=true' },
        { status: 400 }
      )
    }

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

    if (slug || auth.slug) revalidatePath(`/${slug || auth.slug}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update room' }, { status: 500 })
  }
}

/**
 * DELETE /api/rooms?id=xxx
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

    const auth = await verifyByRoomId(request, supabase, id)
    if (auth.error) return auth.error

    await supabase.from('library').update({ room_id: null }).eq('room_id', id)
    await supabase.from('links').update({ room_id: null }).eq('room_id', id)
    const { error } = await supabase.from('rooms').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    if (slug || auth.slug) revalidatePath(`/${slug || auth.slug}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 })
  }
}

/**
 * POST /api/rooms
 * Body: { serial_number, name, position }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(roomsPostSchema, body)
    if (!v.success) return v.response
    const { serial_number, name, position, slug } = v.data

    const supabase = createServerSupabaseClient()

    const auth = await verifyBySerial(request, supabase, serial_number)
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

    if (slug || auth.slug) revalidatePath(`/${slug || auth.slug}`)
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
