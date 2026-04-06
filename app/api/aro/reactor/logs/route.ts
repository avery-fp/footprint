import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/src/aro/lib/auth'
import { getSupabase } from '@/src/aro/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/reactor/logs — recent swarm send history
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req)
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)

  try {
    const supabase = getSupabase()
    const { data: sends } = await supabase
      .from('swarm_sends')
      .select('id, provider, from_domain, status, sent_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    return NextResponse.json({ logs: sends || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
