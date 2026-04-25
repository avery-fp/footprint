import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/stripe'
import { completePaidClaimFromCheckoutSession } from '@/lib/claims/complete-paid-claim'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/webhook')

/**
 * GET /api/webhook
 *
 * Diagnostic probe: confirms STRIPE_WEBHOOK_SECRET is loaded and exposes
 * the first 8 chars so the dashboard signing secret can be compared
 * without leaking the value.
 */
export async function GET() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  return NextResponse.json({
    status: 'ok',
    secretLoaded: !!secret,
    secretPrefix: secret ? secret.slice(0, 8) : 'MISSING',
    secretLength: secret ? secret.length : 0,
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
  })
}

/**
 * POST /api/webhook — Stripe checkout.session.completed (backup path).
 *
 * The primary claim path is now /api/claim/complete (called from
 * /claim/success after Stripe redirects back). The webhook still runs as
 * a safety net for cases where the user closes the tab before the
 * redirect lands. Both paths share lib/claims/complete-paid-claim.ts and
 * are idempotent on payments.stripe_session_id.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    let event
    try {
      event = constructWebhookEvent(body, signature)
    } catch (err: any) {
      const secret = process.env.STRIPE_WEBHOOK_SECRET
      log.error({
        err_message: err?.message || String(err),
        secretLoaded: !!secret,
        secretPrefix: secret ? secret.slice(0, 8) : 'MISSING',
        secretLength: secret ? secret.length : 0,
        signaturePrefix: signature ? signature.slice(0, 10) : 'MISSING',
        signatureLength: signature ? signature.length : 0,
        bodyLength: body.length,
        env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      }, 'Webhook signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const result = await completePaidClaimFromCheckoutSession(event.data.object)
        if (!result.ok) {
          log.error({ error: result.error, detail: result.detail }, 'Claim completion failed (webhook)')
          // 500 → Stripe retries. Don't acknowledge a failed claim.
          return NextResponse.json({ error: result.error }, { status: 500 })
        }
        break
      }
      default:
        log.info(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    log.error({ err: error }, 'Webhook failed')
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
