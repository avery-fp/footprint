import { NextResponse } from 'next/server'

/**
 * /api/publish
 *
 * Legacy claim flow. Superseded by:
 *   - /api/checkout       — creates Stripe session + reserves slug
 *   - /api/webhook        — webhook finalizes claim, issues edit_token
 *   - /api/check-username — pre-checkout username availability probe
 *
 * Kept as a 410 Gone so any cached client that still POSTs here gets a clear
 * signal to refresh instead of a confusing 500.
 */
export async function GET() {
  return NextResponse.json({ error: 'Replaced by /api/checkout' }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ error: 'Replaced by /api/checkout' }, { status: 410 })
}
