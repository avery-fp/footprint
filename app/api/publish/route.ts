import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'
import { stripe, FOOTPRINT_PRICE, FOOTPRINT_CURRENCY } from '@/lib/stripe'
import { RESERVED_SLUGS } from '@/lib/constants'
import { publishSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/publish')

/**
 * POST /api/publish
 *
 * The publish gate. Handles:
 * 1. Username availability check (action: 'check-username')
 * 2. Free publish with promo code (action: 'publish-free')
 * 3. Create Stripe checkout for paid publish (action: 'publish-paid')
 * 4. Finalize after Stripe payment (action: 'finalize')
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const v = validateBody(publishSchema, body)
    if (!v.success) return v.response
    const validatedBody = v.data

    const supabase = createServerSupabaseClient()

    // Get user's unpublished footprint
    const { data: footprint } = await supabase
      .from('footprints')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'No footprint found' }, { status: 404 })
    }

    switch (validatedBody.action) {
      case 'check-username': {
        const { username } = validatedBody

        const clean = username.toLowerCase().trim()
        if (clean.length < 2 || clean.length > 30) {
          return NextResponse.json({ available: false, reason: '2-30 characters' })
        }
        if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(clean) && clean.length > 1) {
          return NextResponse.json({ available: false, reason: 'letters, numbers, dots, dashes only' })
        }

        // Reserved slugs
        if ((RESERVED_SLUGS as readonly string[]).includes(clean)) {
          return NextResponse.json({ available: false, reason: 'reserved' })
        }

        // Check against existing footprints
        const { data: existing } = await supabase
          .from('footprints')
          .select('id')
          .eq('username', clean)
          .single()

        if (existing) {
          return NextResponse.json({ available: false, reason: 'taken' })
        }

        return NextResponse.json({ available: true })
      }

      case 'publish-free': {
        const { username, promo } = validatedBody

        const cleanUsername = username.toLowerCase().trim()
        const cleanPromo = promo.trim().toLowerCase()

        // Validate promo
        const { data: promoCode } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('code', cleanPromo)
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

        // Check username availability again
        const { data: taken } = await supabase
          .from('footprints')
          .select('id')
          .eq('username', cleanUsername)
          .neq('id', footprint.id)
          .single()

        if (taken) {
          return NextResponse.json({ error: 'Username taken' }, { status: 409 })
        }

        // Claim serial
        const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
        if (serialError || !serialData) {
          return NextResponse.json({ error: 'No serials available' }, { status: 500 })
        }

        const serialNumber = serialData

        // Update user with serial
        await supabase
          .from('users')
          .update({ serial_number: serialNumber })
          .eq('id', userId)

        // Publish footprint
        const { error: publishError } = await supabase
          .from('footprints')
          .update({
            username: cleanUsername,
            serial_number: serialNumber,
            published: true,
            published_at: new Date().toISOString(),
          })
          .eq('id', footprint.id)

        if (publishError) {
          log.error({ err: publishError }, 'Publish failed')
          return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
        }

        // Record free payment (non-critical)
        try {
          await supabase.from('payments').insert({
            user_id: userId,
            stripe_session_id: `free_publish_${Date.now()}`,
            amount: 0,
            currency: 'usd',
            status: 'completed',
          })
        } catch (e) { log.error({ err: e }, 'Free payment record failed') }

        // Record conversion event (non-critical)
        try {
          await supabase.from('fp_events').insert({
            footprint_id: footprint.id,
            event_type: 'conversion',
            event_data: {
              serial_number: serialNumber,
              amount: 0,
              source: 'promo',
              promo_code: cleanPromo,
            },
          })
        } catch (e) { log.error({ err: e }, 'Promo conversion event failed') }

        return NextResponse.json({
          success: true,
          serial: serialNumber,
          slug: cleanUsername,
        })
      }

      case 'publish-paid': {
        const { username } = validatedBody

        const cleanUsername = username.toLowerCase().trim()

        // Check username availability
        const { data: taken } = await supabase
          .from('footprints')
          .select('id')
          .eq('username', cleanUsername)
          .neq('id', footprint.id)
          .single()

        if (taken) {
          return NextResponse.json({ error: 'Username taken' }, { status: 409 })
        }

        // Reserve slug on the footprint BEFORE Stripe redirect
        // This prevents another user from claiming it during checkout
        const { error: reserveError } = await supabase
          .from('footprints')
          .update({ username: cleanUsername })
          .eq('id', footprint.id)

        if (reserveError) {
          log.error({ err: reserveError }, 'Failed to reserve slug')
          return NextResponse.json({ error: 'Failed to reserve username' }, { status: 500 })
        }

        // Get user email for Stripe
        const { data: user } = await supabase
          .from('users')
          .select('email')
          .eq('id', userId)
          .single()

        if (!user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

        // Create Stripe Checkout session
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          customer_email: user.email,
          line_items: [
            {
              price_data: {
                currency: FOOTPRINT_CURRENCY,
                product_data: {
                  name: 'Footprint',
                  description: `Publish footprint.onl/${cleanUsername}`,
                },
                unit_amount: FOOTPRINT_PRICE,
              },
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/${encodeURIComponent(cleanUsername)}/home?session_id={CHECKOUT_SESSION_ID}&username=${encodeURIComponent(cleanUsername)}`,
          cancel_url: `${baseUrl}/${encodeURIComponent(cleanUsername)}/home`,
          customer_creation: 'always',
          metadata: {
            product: 'footprint_publish',
            footprint_id: footprint.id,
            user_id: userId,
            username: cleanUsername,
          },
        })

        return NextResponse.json({ url: session.url })
      }

      case 'finalize': {
        const { session_id, username } = validatedBody

        const cleanUsername = username.toLowerCase().trim()

        // Idempotency: if this footprint is already published, return its existing data
        if (footprint.published) {
          return NextResponse.json({
            success: true,
            serial: footprint.serial_number,
            slug: footprint.username,
          })
        }

        // Verify Stripe payment
        const session = await stripe.checkout.sessions.retrieve(session_id)
        if (!session || session.payment_status !== 'paid') {
          return NextResponse.json({ error: 'Payment not confirmed' }, { status: 400 })
        }

        // Verify the Stripe session belongs to this user
        if (session.metadata?.user_id !== userId) {
          return NextResponse.json({ error: 'Session mismatch' }, { status: 403 })
        }

        // Verify the username matches what was submitted to Stripe
        if (session.metadata?.username !== cleanUsername) {
          return NextResponse.json({ error: 'Username mismatch' }, { status: 400 })
        }

        // Check username again
        const { data: taken } = await supabase
          .from('footprints')
          .select('id')
          .eq('username', cleanUsername)
          .neq('id', footprint.id)
          .single()

        if (taken) {
          return NextResponse.json({ error: 'Username was claimed while you were paying' }, { status: 409 })
        }

        // Claim serial
        const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
        if (serialError || !serialData) {
          return NextResponse.json({ error: 'No serials available' }, { status: 500 })
        }

        const serialNumber = serialData

        // Update user with serial
        await supabase
          .from('users')
          .update({
            serial_number: serialNumber,
            stripe_customer_id: session.customer as string,
          })
          .eq('id', userId)

        // Publish footprint
        const { error: publishError } = await supabase
          .from('footprints')
          .update({
            username: cleanUsername,
            serial_number: serialNumber,
            published: true,
            published_at: new Date().toISOString(),
          })
          .eq('id', footprint.id)

        if (publishError) {
          log.error({ err: publishError }, 'Finalize publish failed')
          return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
        }

        // Record payment (non-critical)
        try {
          await supabase.from('payments').insert({
            user_id: userId,
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent as string,
            amount: session.amount_total,
            currency: session.currency,
            status: 'completed',
          })
        } catch (e) { log.error({ err: e }, 'Finalize payment record failed') }

        // Record conversion event (non-critical)
        try {
          await supabase.from('fp_events').insert({
            footprint_id: footprint.id,
            event_type: 'conversion',
            event_data: {
              serial_number: serialNumber,
              amount: session.amount_total,
              source: 'stripe_publish',
            },
          })
        } catch (e) { log.error({ err: e }, 'Finalize conversion event failed') }

        return NextResponse.json({
          success: true,
          serial: serialNumber,
          slug: cleanUsername,
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    log.error({ err: error }, 'Publish failed')
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
