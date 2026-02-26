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
    .from('aro_messages')
    .select('*, targets(username, platform, layer), message_variants(name)')
    .order('scheduled_at', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  return NextResponse.json({
    total: data?.length || 0,
    messages: data || [],
  })
}
