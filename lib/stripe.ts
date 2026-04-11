import Stripe from 'stripe'
import { FOOTPRINT_PRICE_CENTS } from './constants'

// Lazy-initialized Stripe client — avoids build-time env var evaluation
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('Missing required env var: STRIPE_SECRET_KEY')
    }
    _stripe = new Stripe(key)
  }
  return _stripe
}

// Product config - $10 one-time
export const FOOTPRINT_PRICE = FOOTPRINT_PRICE_CENTS
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
  const session = await getStripe().checkout.sessions.create({
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
            description: 'one page for everything.',
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
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('Missing required env var: STRIPE_WEBHOOK_SECRET')
  }
  return getStripe().webhooks.constructEvent(payload, signature, secret)
}

/**
 * Retrieve a checkout session
 */
export async function getCheckoutSession(sessionId: string) {
  return getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ['customer', 'payment_intent'],
  })
}
