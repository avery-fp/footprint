import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { completePaidClaimFromCheckoutSession } from '@/lib/claims/complete-paid-claim'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/claim/complete')

export const dynamic = 'force-dynamic'

/**
 * POST /api/claim/complete
 *
 * Body: { session_id: "cs_..." }
 *
 * The synchronous post-payment claim path. Verifies the Stripe Checkout
 * Session server-side and promotes the draft into a claimed footprint.
 * No webhook dependency — works even when the webhook delivery is broken.
 *
 * Idempotent: a second call with the same session_id (or a parallel
 * webhook hit) returns the same { slug, edit_token } and writes nothing
 * new.
 *
 * Returns:
 *   200  { ok: true, slug, edit_token, edit_url }
 *   400  invalid body / missing session
 *   402  session not yet paid
 *   500  Stripe lookup or DB failure
 */
export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : ''
  if (!sessionId.startsWith('cs_')) {
    return NextResponse.json({ ok: false, error: 'session_id required' }, { status: 400 })
  }

  let session: any
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId)
  } catch (err: any) {
    log.error({ err_message: err?.message, sessionId }, 'Stripe session retrieve failed')
    return NextResponse.json(
      { ok: false, error: 'session_lookup_failed', detail: err?.message || null },
      { status: 500 }
    )
  }

  if (session?.payment_status !== 'paid') {
    return NextResponse.json(
      { ok: false, error: 'not_paid', payment_status: session?.payment_status || null },
      { status: 402 }
    )
  }

  const result = await completePaidClaimFromCheckoutSession(session)
  if (!result.ok) {
    log.error({ error: result.error, detail: result.detail, sessionId }, 'Claim completion failed (sync)')
    return NextResponse.json(
      { ok: false, error: result.error, detail: result.detail || null },
      { status: result.status }
    )
  }

  return NextResponse.json({
    ok: true,
    slug: result.slug,
    edit_token: result.edit_token,
    edit_url: `/${result.slug}/home`,
    already_processed: result.alreadyProcessed,
  })
}
