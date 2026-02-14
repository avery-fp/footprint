import Stripe from 'stripe'

// Initialize Stripe with secret key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Product config - $10 one-time
export const FOOTPRINT_PRICE = 1000 // cents
export const FOOTPRINT_CURRENCY = 'usd'

/**
 * Create a Stripe Checkout session for purchasing a Footprint
 * 
 * This is the moment of truth - $10 and they're in forever.
 * No subscription. No upsells. Just ownership.
 */
export async function createCheckoutSession(params: {
  email?: string
  successUrl: string
  cancelUrl: string
}) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: params.email,
    
    // The product - simple, clean, no tricks
    line_items: [
      {
        price_data: {
          currency: FOOTPRINT_CURRENCY,
          product_data: {
            name: 'Footprint',
            description: 'a room for your internet.',
            images: ['https://footprint.onl/api/og'],
          },
          unit_amount: FOOTPRINT_PRICE,
        },
        quantity: 1,
      },
    ],
    
    // Where to go after
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    
    // Collect email if not provided
    customer_creation: 'always',
    
    // Metadata for webhook processing
    metadata: {
      product: 'footprint',
      version: '1.0',
    },
  })

  return session
}

/**
 * Verify webhook signature
 * 
 * Stripe sends webhooks to confirm payments.
 * This makes sure they're actually from Stripe.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  )
}

/**
 * Retrieve a checkout session
 */
export async function getCheckoutSession(sessionId: string) {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['customer', 'payment_intent'],
  })
}
