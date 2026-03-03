import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

/**
 * GET /api/aro/health
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    const supabase = createServerSupabaseClient()
    const { count } = await supabase.from('targets').select('id', { count: 'exact', head: true })
    return NextResponse.json({ status: 'ok', targets: count || 0, timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', targets: 0, timestamp: new Date().toISOString() }, { status: 500 })
  }
}
