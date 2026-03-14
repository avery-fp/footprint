import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { nanoid } from 'nanoid'
import { checkoutFreeSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/checkout/free')

/**
 * POST /api/checkout/free
 *
 * Handles free checkout via promo code "please".
 * Creates user, assigns serial, sets session cookie, returns redirect.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(checkoutFreeSchema, body)
    if (!v.success) return v.response
    const { email, promo, ref } = v.data

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

    // Atomically claim a promo usage slot (prevents race condition on max_uses)
    const { data: promoResult, error: promoUpdateError } = await supabase.rpc('increment_promo_usage', {
      promo_id: promoCode.id,
    })
    if (promoUpdateError || promoResult === -1) {
      return NextResponse.json({ error: 'Promo code expired' }, { status: 400 })
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, serial_number')
      .eq('email', normalizedEmail)
      .single()

    if (existingUser) {
      const sessionToken = await createSessionToken(existingUser.id, existingUser.email)
      const response = NextResponse.json({ success: true, serial: existingUser.serial_number })
      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
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
      log.error({ err: fpError }, 'CRITICAL: Free checkout footprint creation failed')
      return NextResponse.json({ error: 'Failed to create page' }, { status: 500 })
    }

    // Record free payment (non-critical)
    try {
      await supabase.from('payments').insert({
        user_id: user.id,
        stripe_session_id: `free_${nanoid(16)}`,
        amount: 0,
        currency: 'usd',
        status: 'completed',
      })
    } catch {}

    // Track referral (non-critical)
    if (ref) {
      const refSerial = parseInt(ref.replace('FP-', ''), 10)
      if (!isNaN(refSerial)) {
        try {
          await supabase.from('referrals').insert({
            referrer_serial: refSerial,
            referred_user_id: user.id,
            referral_code: ref,
            converted: true,
          })
        } catch {}
      }
    }

    // Record conversion event (non-critical)
    const { data: fp } = await supabase
      .from('footprints')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    if (fp) {
      try {
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
        })
      } catch {}
    }

    // Create session + set cookie
    const sessionToken = await createSessionToken(user.id, user.email)
    const response = NextResponse.json({ success: true, serial: serialNumber, slug: username })

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

    return response
  } catch (error: any) {
    log.error({ err: error }, 'Free checkout failed')
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
