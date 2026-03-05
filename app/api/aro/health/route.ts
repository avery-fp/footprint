import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

/**
 * GET /api/aro/health
 *
 * Comprehensive health check for the entire ARO system.
 * Probes every table the organism depends on.
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    const supabase = createServerSupabaseClient()

    const tables = [
      'targets',
      'categories',
      'aro_serials',
      'message_variants',
      'aro_messages',
      'distribution_plans',
      'aro_events',
      'learning_snapshots',
      'fp_deployment_packs',
      'fp_distribution_events',
      'fp_utm_visits',
      'aro_surfaces',
      'aro_seeds',
      'aro_locks',
      'aro_platform_state',
    ] as const

    const checks: Record<string, { ok: boolean; count?: number; error?: string }> = {}
    let allOk = true

    await Promise.all(
      tables.map(async (table) => {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .limit(0)

        if (error) {
          checks[table] = { ok: false, error: error.message }
          allOk = false
        } else {
          checks[table] = { ok: true, count: count ?? 0 }
        }
      })
    )

    // Check critical functions exist
    const { error: serialFnErr } = await supabase.rpc('next_serial')
    checks['fn:next_serial'] = serialFnErr
      ? { ok: false, error: serialFnErr.message }
      : { ok: true }

    const { error: canPostErr } = await supabase.rpc('aro_can_post', {
      p_platform: '__health_check__',
      p_daily_cap: 1,
    })
    checks['fn:aro_can_post'] = canPostErr
      ? { ok: false, error: canPostErr.message }
      : { ok: true }

    // Queued seeds count
    const { count: queuedSeeds } = await supabase
      .from('aro_seeds')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')

    return NextResponse.json({
      status: allOk ? 'ok' : 'degraded',
      queued_seeds: queuedSeeds ?? 0,
      tables: checks,
      timestamp: new Date().toISOString(),
    }, { status: allOk ? 200 : 503 })
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', error: error?.message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
