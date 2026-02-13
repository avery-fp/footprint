import { NextRequest, NextResponse } from 'next/server'
import { stripe, FOOTPRINT_PRICE, FOOTPRINT_CURRENCY } from '@/lib/stripe'

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session for purchasing a Footprint.
 *
 * The beautiful simplicity: $10 once, you're in forever.
 * No subscriptions, no tiers, no upsells.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, slug } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

    // Build success URL with slug if provided
    const successUrl = slug
      ? `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&slug=${encodeURIComponent(slug)}`
      : `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`

    const cancelUrl = slug
      ? `${baseUrl}/edit/${encodeURIComponent(slug)}`
      : `${baseUrl}/checkout`

    // Create Stripe Checkout session with slug in metadata
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
                : 'One page. Paste anything. Yours forever.',
            },
            unit_amount: FOOTPRINT_PRICE,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_creation: 'always',
      metadata: {
        product: 'footprint',
        slug: slug || '',
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
