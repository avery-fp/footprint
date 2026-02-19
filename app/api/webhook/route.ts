import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent, stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendWelcomeEmail } from '@/lib/auth'
import { nanoid } from 'nanoid'

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
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object)
        break
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}

async function handleCheckoutComplete(session: any) {
  const supabase = createServerSupabaseClient()
  const email = session.customer_email || session.customer_details?.email

  if (!email) throw new Error('No email found in checkout session')

  // Idempotency: check if this session was already processed
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('stripe_session_id', session.id)
    .single()

  if (existingPayment) {
    console.log(`⤴ Webhook already processed: ${session.id}`)
    return
  }

  // Check if user already exists (import-draft may have run first)
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, serial_number')
    .eq('email', email)
    .single()

  if (existingUser) {
    // User exists (import-draft created them) — just record payment if missing
    await supabase.from('payments').insert({
      user_id: existingUser.id,
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent,
      amount: session.amount_total,
      currency: session.currency,
      status: 'completed',
    }).onConflict('stripe_session_id').ignore()

    console.log(`⤴ User already exists: ${email} #${existingUser.serial_number}`)
    return
  }

  const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
  if (serialError || !serialData) throw new Error('Failed to claim serial number')

  const serialNumber = serialData
  const username = `fp-${serialNumber}-${nanoid(4).toLowerCase()}`

  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      email,
      serial_number: serialNumber,
      stripe_customer_id: session.customer,
      referred_by: session.metadata?.ref || null,
    })
    .select()
    .single()

  if (userError || !user) throw new Error('Failed to create user')

  await supabase.from('footprints').insert({
    user_id: user.id,
    username,
    serial_number: serialNumber,
    name: 'Everything',
    icon: '◈',
    is_primary: true,
    published: true,
  })

  await supabase.from('payments').insert({
    user_id: user.id,
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent,
    amount: session.amount_total,
    currency: session.currency,
    status: 'completed',
  })

  console.log(`✓ New user: ${email} #${serialNumber}`)

  // Send welcome email — fire-and-forget, don't block webhook response
  sendWelcomeEmail(email, serialNumber, username)
    .then(() => console.log(`✓ Welcome email sent: ${email}`))
    .catch((err) => console.error(`⚠ Welcome email failed for ${email}:`, err))
}
