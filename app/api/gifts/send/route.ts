import { NextResponse } from 'next/server'

/**
 * POST /api/gifts/send
 *
 * Disabled until gifting is rebuilt on the Stripe-identity model.
 * Originally depended on the JWT session for sender identity; the
 * replacement would need to tie a gift to the edit_token of the sending
 * footprint, which is out of scope for this rebuild.
 */
export async function POST() {
  return NextResponse.json({ error: 'Gifts are temporarily disabled' }, { status: 503 })
}
