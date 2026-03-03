import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/plan
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminOrMachine(request)
  if (auth instanceof NextResponse) return auth

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
