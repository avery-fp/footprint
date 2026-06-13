import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'claim_completion_moved_to_stripe_webhook' },
    { status: 410 }
  )
}
