import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/messages
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminOrMachine(request)
  if (auth instanceof NextResponse) return auth

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
