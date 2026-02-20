import { NextRequest, NextResponse } from 'next/server'
import { stripe, FOOTPRINT_PRICE, FOOTPRINT_CURRENCY } from '@/lib/stripe'

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
    const { email, slug, remix_source, remix_room, ref } = body

    if (!email && !remix_source) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

    const successUrl = `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`

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
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Checkout error:', error)

    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
