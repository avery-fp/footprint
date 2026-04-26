import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { normalizeEmail, sendRecoveryEmail } from '@/lib/auth'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/recover')

/**
 * POST /api/recover
 * Body: { email }
 *
 * Rotates edit_token for every footprint owned by this email, then emails
 * new edit URLs to the verified email. Always 200 OK to prevent enumeration.
 * Rate-limited: 3 requests per email per rolling hour.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const rawEmail = typeof body?.email === 'string' ? body.email : null
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      // Still 200 to avoid distinguishing shape errors from missing accounts.
      return NextResponse.json({ ok: true })
    }
    const email = normalizeEmail(rawEmail)

    const supabase = createServerSupabaseClient()

    // ── Rate limit: 3 / hour ──
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('recovery_attempts')
      .select('email', { count: 'exact', head: true })
      .eq('email', email)
      .gte('attempted_at', oneHourAgo)

    if ((count ?? 0) >= 3) {
      log.info(`Recovery rate-limited: ${email}`)
      return NextResponse.json({ ok: true })
    }

    // Record this attempt before doing work (so even failed sends count).
    await supabase.from('recovery_attempts').insert({ email })

    // ── Find user ──
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (!user) {
      // Send "no account" email anyway to match successful-send timing.
      sendRecoveryEmail(email, []).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // ── Rotate edit_token on each owned footprint ──
    const { data: footprints } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)

    const rotated: Array<{ slug: string; editToken: string }> = []

    for (const fp of footprints || []) {
      const newToken = (globalThis as any).crypto?.randomUUID?.()
        ?? require('crypto').randomUUID()
      const { error } = await supabase
        .from('footprints')
        .update({ edit_token: newToken })
        .eq('username', fp.username)
        .eq('user_id', user.id)
      if (!error) {
        rotated.push({ slug: fp.username, editToken: newToken })
      } else {
        log.error({ err: error, slug: fp.username }, 'Recovery token rotation failed')
      }
    }

    sendRecoveryEmail(email, rotated)
      .then(() => log.info(`Recovery email sent: ${email} (${rotated.length} footprints)`))
      .catch((err) => log.error({ err }, `Recovery email failed for ${email}`))

    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error({ err }, 'Recovery failed')
    // Still 200 — no enumeration signal.
    return NextResponse.json({ ok: true })
  }
}
