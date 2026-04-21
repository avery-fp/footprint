import { NextResponse } from 'next/server'

/**
 * GET /api/gifts/remaining
 *
 * Gifting is out of scope for the Stripe-identity rebuild. Returning a
 * stable 0 keeps the editor's gift-count indicator quiet without auth.
 */
export async function GET() {
  return NextResponse.json({ remaining: 0 })
}
