import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

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
