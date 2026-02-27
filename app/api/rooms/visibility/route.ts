import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { roomId, hidden } = await request.json()

    if (!roomId || typeof hidden !== 'boolean') {
      return NextResponse.json({ error: 'roomId and hidden required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Look up room → serial_number → footprint → verify ownership
    const { data: room } = await supabase
      .from('rooms')
      .select('serial_number')
      .eq('id', roomId)
      .single()

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id, username')
      .eq('serial_number', room.serial_number)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase
      .from('rooms')
      .update({ hidden })
      .eq('id', roomId)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    if (footprint.username) revalidatePath(`/${footprint.username}`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update visibility' }, { status: 500 })
  }
}
