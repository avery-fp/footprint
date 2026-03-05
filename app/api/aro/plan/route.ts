import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/plan
 *
 * Returns the most recent distribution plan.
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('distribution_plans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'No plan found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('ARO plan error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch plan' },
      { status: 500 }
    )
  }
}
