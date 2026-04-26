import { NextResponse } from 'next/server'

/**
 * POST /api/gifts/claim
 *
 * Disabled. The original flow minted a JWT session for the gift recipient.
 * With Stripe as identity, there's no session to create. Rebuild gifting on
 * top of a Stripe-funded claim before re-enabling.
 */
export async function POST() {
  return NextResponse.json({ error: 'Gift claim temporarily disabled' }, { status: 503 })
}
