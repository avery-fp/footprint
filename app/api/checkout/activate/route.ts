import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken } from '@/lib/auth'
import { setSessionCookie } from '@/lib/cookies'
import { stripe } from '@/lib/stripe'

/**
 * POST /api/checkout/activate
 *
 * Called after Stripe checkout completes.
 * Verifies the Stripe session, finds the user, creates a session cookie.
 * Turns a Stripe receipt into a logged-in user.
 */
export async function POST(request: NextRequest) {
  try {
    const { session_id } = await request.json()

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    // Verify with Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id)

    if (!session || session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not confirmed' }, { status: 400 })
    }

    const rawEmail = session.customer_email || session.customer_details?.email

    if (!rawEmail) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
    }

    const email = rawEmail.toLowerCase().trim()
    const supabase = createServerSupabaseClient()

    // Poll briefly — webhook may be slightly behind
    let user = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabase
        .from('users')
        .select('id, email, serial_number')
        .ilike('email', email)
        .single()

      if (data) {
        user = data
        break
      }
      await new Promise(r => setTimeout(r, 1000))
    }

    if (!user) {
      return NextResponse.json({ error: 'Account not ready yet. Try refreshing.' }, { status: 404 })
    }

    // Get primary footprint
    const { data: footprint } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    // Create session token + set cookie
    const sessionToken = await createSessionToken(user.id, user.email)

    const response = NextResponse.json({
      success: true,
      serial: user.serial_number,
      slug: footprint?.username || null,
    })

    setSessionCookie(response, sessionToken, new URL(request.url).hostname)

    return response
  } catch (error: any) {
    console.error('Activate error:', error)
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 })
  }
}
