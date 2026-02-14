import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent, stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase'
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

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (existingUser) return

  const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
  if (serialError || !serialData) throw new Error('Failed to claim serial number')

  const serialNumber = serialData
  const slug = `fp-${serialNumber}-${nanoid(4).toLowerCase()}`

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
    slug,
    name: 'Everything',
    icon: '◈',
    is_primary: true,
    is_public: true,
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
}
