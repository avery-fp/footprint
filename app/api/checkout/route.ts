import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession } from '@/lib/stripe'

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
    // Get email from request body
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Get the base URL for redirects
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Create Stripe Checkout session
    const session = await createCheckoutSession({
      email,
      successUrl: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/checkout`,
    })

    // Return the checkout URL
    return NextResponse.json({ url: session.url })

  } catch (error) {
    console.error('Checkout error:', error)
    
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
