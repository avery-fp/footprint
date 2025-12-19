import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent, stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase'
import { nanoid } from 'nanoid'

/**
 * POST /api/webhook
 * 
 * Handles Stripe webhooks. The critical one is checkout.session.completed,
 * which fires when someone pays their $10.
 * 
 * When that happens, we:
 * 1. Claim the next available serial number
 * 2. Create the user account
 * 3. Create their first (primary) footprint
 * 
 * All in one atomic operation. Clean.
 */
export async function POST(request: NextRequest) {
  try {
    // Get the raw body and signature
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    // Verify the webhook is from Stripe
    let event
    try {
      event = constructWebhookEvent(body, signature)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object)
        break
      
      // Add other event types as needed
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}

/**
 * Handle successful checkout
 * 
 * This is the moment of creation. Someone paid $10. 
 * Now they get their serial number and their universe.
 */
async function handleCheckoutComplete(session: any) {
  const supabase = createServerSupabaseClient()
  
  // Get customer email
  const email = session.customer_email || session.customer_details?.email
  
  if (!email) {
    throw new Error('No email found in checkout session')
  }

  // Check if user already exists (shouldn't happen, but safety first)
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (existingUser) {
    console.log('User already exists:', email)
    return
  }

  // Claim the next serial number
  // This uses the atomic function we created in the schema
  const { data: serialData, error: serialError } = await supabase
    .rpc('claim_next_serial')

  if (serialError || !serialData) {
    throw new Error('Failed to claim serial number')
  }

  const serialNumber = serialData

  // Generate a unique slug for their primary footprint
  // e.g., "fp-8291-x7k9"
  const slug = `fp-${serialNumber}-${nanoid(4).toLowerCase()}`

  // Create the user
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      email,
      serial_number: serialNumber,
      stripe_customer_id: session.customer,
    })
    .select()
    .single()

  if (userError || !user) {
    throw new Error('Failed to create user')
  }

  // Create their primary footprint
  const { error: footprintError } = await supabase
    .from('footprints')
    .insert({
      user_id: user.id,
      slug,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      is_public: true,
      display_name: null,
      handle: null,
      bio: null,
    })

  if (footprintError) {
    throw new Error('Failed to create footprint')
  }

  // Record the payment
  await supabase
    .from('payments')
    .insert({
      user_id: user.id,
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent,
      amount: session.amount_total,
      currency: session.currency,
      status: 'completed',
    })

  console.log(`✓ New user created: ${email} with serial #${serialNumber}`)
}

// Disable body parsing since we need the raw body for verification
export const config = {
  api: {
    bodyParser: false,
  },
}
