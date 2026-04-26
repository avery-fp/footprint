import { NextResponse } from 'next/server'

/**
 * POST /api/checkout/activate
 *
 * Legacy post-payment session minter. Replaced by:
 *   - /api/webhook           — webhook finalizes the claim
 *   - /api/footprint/[slug]  — returns edit_token on ?stripe_session_id
 *   - /api/edit-unlock       — sets fp_edit_{slug} cookie
 *
 * Kept as 410 Gone so stale clients see a clear signal.
 */
export async function POST() {
  return NextResponse.json({ error: 'Replaced by /api/edit-unlock' }, { status: 410 })
}
