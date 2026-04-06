import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/publish/phase
 *
 * Returns whether the next claim will be a seed-phase (free) publish.
 * UI uses this to hide the $10 display during the silent pre-monetization phase.
 *
 * Fails closed: on error, returns seedPhase=false (default to charging).
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.rpc('peek_next_serial_seed', { p_threshold: 500 })
    if (error) throw error
    return NextResponse.json({ seedPhase: data === true })
  } catch {
    return NextResponse.json({ seedPhase: false })
  }
}
