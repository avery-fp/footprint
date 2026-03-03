import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/targets
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminOrMachine(request)
  if (auth instanceof NextResponse) return auth

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('targets')
    .select('*, categories(name)')
    .order('layer', { ascending: true })
    .order('conversion_probability', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch targets' }, { status: 500 })
  }

  // Group by layer
  const byLayer: Record<number, number> = {}
  for (const t of data || []) {
    byLayer[t.layer] = (byLayer[t.layer] || 0) + 1
  }

  return NextResponse.json({
    total: data?.length || 0,
    byLayer,
    targets: data || [],
  })
}
