import { NextRequest, NextResponse } from 'next/server'
import { stripe, FOOTPRINT_PRICE, FOOTPRINT_CURRENCY } from '@/lib/stripe'
import { checkoutSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/checkout')

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session for purchasing a Footprint.
 *
 * The beautiful simplicity: $10 once.
 * No subscriptions, no tiers, no upsells.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(checkoutSchema, body)
    if (!v.success) return v.response
    const { email, slug, remix_source, remix_room, ref } = v.data

    // ── SID attribution: read from cookie or request body ──
    const cookieSid = request.cookies.get('fp_sid')?.value ?? null
    const bodySid = (body.sid && typeof body.sid === 'string') ? body.sid : null
    const rawSid = bodySid || cookieSid
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const validSid = rawSid && uuidRegex.test(rawSid) ? rawSid : null

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

    const successUrl = slug
      ? `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&slug=${encodeURIComponent(slug)}`
      : `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`

    const cancelUrl = slug
      ? `${baseUrl}/${encodeURIComponent(slug)}/home`
      : `${baseUrl}/checkout`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: FOOTPRINT_CURRENCY,
            product_data: {
              name: 'Footprint',
              description: slug
                ? `Publish footprint.onl/${slug}`
                : 'one page. all your things.',
            },
            unit_amount: FOOTPRINT_PRICE,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_creation: 'always',
      allow_promotion_codes: true,
      metadata: {
        product: 'footprint',
        slug: slug || '',
        ref: ref || '',
        ...(remix_source ? { remix_source } : {}),
        ...(remix_room ? { remix_room } : {}),
        ...(validSid ? { sid: validSid } : {}),
      },
      ...(validSid ? { client_reference_id: validSid } : {}),
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    log.error({ err: error }, 'Checkout failed')

    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
