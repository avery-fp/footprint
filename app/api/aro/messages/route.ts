import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('aro_messages')
    .select('*, targets(username, platform, layer), message_variants(name)')
    .order('scheduled_at', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    total: data?.length || 0,
    messages: data || [],
  })
}
