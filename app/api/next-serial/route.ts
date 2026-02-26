import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Require authentication — leaks business metrics
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('footprints')
      .select('serial_number')
      .order('serial_number', { ascending: false })
      .limit(1)
      .single()

    const next = data ? data.serial_number + 1 : 1002
    return NextResponse.json({ serial: next })
  } catch {
    return NextResponse.json({ serial: 1002 })
  }
}
