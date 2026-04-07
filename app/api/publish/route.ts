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
 * 2. Unified publish — auto-routes seed (free) vs paid (action: 'publish')
 * 3. Free publish with promo code (action: 'publish-free') [legacy]
 * 4. Create Stripe checkout for paid publish (action: 'publish-paid') [legacy]
 * 5. Finalize after Stripe payment (action: 'finalize')
 *
 * The 'publish' action is the canonical entry point. It atomically claims
 * a serial and routes to the seed (free, instant) or paid (Stripe) flow
 * based on whether the claimed serial falls within the seed range
 * (serials 7777-8276 = first 500 publishes).
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
    let { data: footprint } = await supabase
      .from('footprints')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single()

    // For the /claim flow: OAuth users arrive authenticated but without a footprint yet.
    // Create a placeholder footprint so check-username, publish, and publish-paid can proceed.
    if (!footprint) {
      if (validatedBody.action === 'check-username' || validatedBody.action === 'publish-paid' || validatedBody.action === 'publish') {
        const { data: newFp, error: createFpError } = await supabase
          .from('footprints')
          .insert({
            user_id: userId,
            username: `pending-${userId.replace(/-/g, '').slice(0, 12)}`,
            is_primary: true,
            published: false,
          })
          .select('*')
          .single()

        if (createFpError || !newFp) {
          log.error({ err: createFpError }, 'Failed to create placeholder footprint')
          return NextResponse.json({ error: 'Could not initialize your space. Try again.' }, { status: 500 })
        }

        footprint = newFp
      } else {
        return NextResponse.json({ error: 'No footprint found' }, { status: 404 })
      }
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

      case 'publish': {
        const { username, return_to } = validatedBody
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

        // Determine seed phase via the count-based check (production-aware)
        const { data: phaseResult } = await supabase.rpc('peek_next_serial_seed')
        const isSeed = phaseResult === true

        if (isSeed) {
          // ── SEED PATH: claim serial + publish immediately, no Stripe ──
          const { data: claimedSerial, error: serialError } = await supabase.rpc('claim_next_serial')
          if (serialError || !claimedSerial) {
            log.error({ err: serialError }, 'No serials available (seed path)')
            return NextResponse.json({ error: 'No serials available' }, { status: 500 })
          }
          const serialNumber: number = claimedSerial

          await supabase
            .from('users')
            .update({ serial_number: serialNumber })
            .eq('id', userId)

          const { error: publishError } = await supabase
            .from('footprints')
            .update({
              username: cleanUsername,
              serial_number: serialNumber,
              published: true,
              published_at: new Date().toISOString(),
              is_seed: true,
              payment_type: 'seed',
            })
            .eq('id', footprint.id)

          if (publishError) {
            log.error({ err: publishError }, 'Seed publish failed')
            return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
          }

          // Audit (non-critical) — use 'purchases' table (production schema)
          try {
            const { data: u } = await supabase
              .from('users')
              .select('email')
              .eq('id', userId)
              .single()
            if (u?.email) {
              await supabase.from('purchases').insert({
                email: u.email,
                serial_number: serialNumber,
                stripe_session_id: `seed_${serialNumber}_${Date.now()}`,
                amount_cents: 0,
                status: 'completed',
              })
            }
          } catch (e) { log.error({ err: e }, 'Seed purchase record failed') }

          try {
            await supabase.from('fp_events').insert({
              footprint_id: footprint.id,
              event_type: 'conversion',
              event_data: {
                serial_number: serialNumber,
                amount: 0,
                source: 'seed',
              },
            })
          } catch (e) { log.error({ err: e }, 'Seed conversion event failed') }

          return NextResponse.json({
            success: true,
            serial: serialNumber,
            slug: cleanUsername,
          })
        }

        // ── PAID PATH: reserve username, hand off to Stripe ──
        // Serial is NOT pre-claimed in production (the existing claim_next_serial
        // is MAX+1 with no atomic claim, so we let finalize claim it post-payment).
        const { error: reserveError } = await supabase
          .from('footprints')
          .update({ username: cleanUsername })
          .eq('id', footprint.id)

        if (reserveError) {
          log.error({ err: reserveError }, 'Failed to reserve slug (publish action)')
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

        // Create Stripe checkout session — finalize will claim the serial post-payment
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
          success_url: return_to
            ? `${baseUrl}${return_to}${return_to.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}&username=${encodeURIComponent(cleanUsername)}`
            : `${baseUrl}/${cleanUsername}?claim=1&session_id={CHECKOUT_SESSION_ID}&username=${encodeURIComponent(cleanUsername)}`,
          cancel_url: return_to ? `${baseUrl}${return_to}` : `${baseUrl}/${cleanUsername}`,
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

      case 'publish-paid': {
        const { username, return_to } = validatedBody

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
          success_url: return_to
            ? `${baseUrl}${return_to}${return_to.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}&username=${encodeURIComponent(cleanUsername)}`
            : `${baseUrl}/claim?session_id={CHECKOUT_SESSION_ID}&username=${encodeURIComponent(cleanUsername)}`,
          cancel_url: return_to ? `${baseUrl}${return_to}` : `${baseUrl}/claim`,
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

        // Claim serial post-payment
        const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
        if (serialError || !serialData) {
          return NextResponse.json({ error: 'No serials available' }, { status: 500 })
        }
        const serialNumber: number = serialData

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
            payment_type: 'stripe',
          })
          .eq('id', footprint.id)

        if (publishError) {
          log.error({ err: publishError }, 'Finalize publish failed')
          return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
        }

        // Record purchase (non-critical) — production uses 'purchases' table
        try {
          const { data: u } = await supabase
            .from('users')
            .select('email')
            .eq('id', userId)
            .single()
          if (u?.email) {
            await supabase.from('purchases').insert({
              email: u.email,
              serial_number: serialNumber,
              stripe_session_id: session.id,
              amount_cents: session.amount_total,
              status: 'completed',
            })
          }
        } catch (e) { log.error({ err: e }, 'Finalize purchase record failed') }

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
