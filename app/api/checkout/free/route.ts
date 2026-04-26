import { NextResponse } from 'next/server'

/**
 * POST /api/checkout/free
 *
 * Promo-code free claim. Disabled during the Stripe-identity rebuild:
 * the old flow synthesized a JWT session for the user, which no longer
 * exists. A future rebuild can mint an edit_token directly and follow
 * the same /{slug}?claimed=true redirect pattern.
 */
export async function POST() {
  return NextResponse.json({ error: 'Free claim temporarily disabled' }, { status: 503 })
}
