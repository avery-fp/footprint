import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'

export async function PATCH(request: NextRequest) {
  try {
    const { roomId, hidden } = await request.json()

    if (!roomId || typeof hidden !== 'boolean') {
      return NextResponse.json({ error: 'roomId and hidden required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

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
      .select('username')
      .eq('serial_number', room.serial_number)
      .single()

    if (!footprint?.username) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const auth = await getEditAuth(request, footprint.username)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('rooms')
      .update({ hidden })
      .eq('id', roomId)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    revalidatePath(`/${footprint.username}`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update visibility' }, { status: 500 })
  }
}
