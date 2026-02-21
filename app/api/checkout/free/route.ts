import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken } from '@/lib/auth'
import { setSessionCookie } from '@/lib/cookies'
import { nanoid } from 'nanoid'

/**
 * POST /api/checkout/free
 *
 * Handles free checkout via promo code "please".
 * Creates user, assigns serial, sets session cookie, returns redirect.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, promo, ref } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const normalizedPromo = (promo || '').trim().toLowerCase()
    const supabase = createServerSupabaseClient()

    // Validate promo code
    const { data: promoCode } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', normalizedPromo)
      .eq('active', true)
      .single()

    if (!promoCode || promoCode.discount_cents < 1000) {
      return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 })
    }

    if (promoCode.max_uses !== null && promoCode.times_used >= promoCode.max_uses) {
      return NextResponse.json({ error: 'Promo code expired' }, { status: 400 })
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, serial_number')
      .ilike('email', normalizedEmail)
      .single()

    const hostname = new URL(request.url).hostname

    if (existingUser) {
      const sessionToken = await createSessionToken(existingUser.id, existingUser.email)
      const response = NextResponse.json({ success: true, serial: existingUser.serial_number })
      setSessionCookie(response, sessionToken, hostname)
      return response
    }

    // Claim serial
    const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
    if (serialError || !serialData) {
      return NextResponse.json({ error: 'No serials available' }, { status: 500 })
    }

    const serialNumber = serialData
    const username = `fp-${serialNumber}-${nanoid(4).toLowerCase()}`

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: normalizedEmail,
        serial_number: serialNumber,
        referred_by: ref || null,
      })
      .select()
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    // Create default footprint
    const { error: fpError } = await supabase.from('footprints').insert({
      user_id: user.id,
      username,
      serial_number: serialNumber,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      published: true,
    })

    if (fpError) {
      console.error('CRITICAL: Free checkout footprint creation failed:', fpError)
      return NextResponse.json({ error: 'Failed to create page' }, { status: 500 })
    }

    // Record free payment
    await supabase.from('payments').insert({
      user_id: user.id,
      stripe_session_id: `free_${nanoid(16)}`,
      amount: 0,
      currency: 'usd',
      status: 'completed',
    })

    // Increment promo usage
    await supabase
      .from('promo_codes')
      .update({ times_used: promoCode.times_used + 1 })
      .eq('id', promoCode.id)

    // Track referral
    if (ref) {
      const refSerial = parseInt(ref.replace('FP-', ''), 10)
      if (!isNaN(refSerial)) {
        await supabase.from('referrals').insert({
          referrer_serial: refSerial,
          referred_user_id: user.id,
          referral_code: ref,
          converted: true,
        }).catch(() => {})
      }
    }

    // Record conversion event for analytics micro-brain
    const { data: fp } = await supabase
      .from('footprints')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    if (fp) {
      await supabase.from('fp_events').insert({
        footprint_id: fp.id,
        event_type: 'conversion',
        event_data: {
          serial_number: serialNumber,
          amount: 0,
          ref: ref || null,
          source: 'promo',
          promo_code: normalizedPromo,
        },
      }).catch(() => {})
    }

    // Create session + set cookie
    const sessionToken = await createSessionToken(user.id, user.email)
    const response = NextResponse.json({ success: true, serial: serialNumber, slug: username })

    setSessionCookie(response, sessionToken, hostname)

    return response
  } catch (error: any) {
    console.error('Free checkout error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
