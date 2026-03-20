import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const { data: user } = await supabase
    .from('users')
    .select('gifts_remaining')
    .eq('id', userId)
    .single()

  return NextResponse.json({ remaining: user?.gifts_remaining || 0 })
}
