import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const aroKey = new URL(request.url).searchParams.get('aro_key')
  if (!aroKey || aroKey !== process.env.ARO_KEY) {
    return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('distribution_plans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    return NextResponse.json({ error: 'No plan found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
