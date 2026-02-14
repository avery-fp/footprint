import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function PATCH(request: NextRequest) {
  try {
    const { roomId, hidden } = await request.json()

    if (!roomId || typeof hidden !== 'boolean') {
      return NextResponse.json({ error: 'roomId and hidden required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('rooms')
      .update({ hidden })
      .eq('id', roomId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update visibility' }, { status: 500 })
  }
}
