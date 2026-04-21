import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getPriceForCountry } from '@/lib/pricing'
import { checkoutSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { createServerSupabaseClient } from '@/lib/supabase'
import { RESERVED_SLUGS } from '@/lib/constants'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/checkout')

const SLUG_RE = /^[a-z0-9-]{1,40}$/

function normalizeSlug(s: string | undefined | null): string | null {
  if (!s) return null
  const clean = s.toLowerCase().trim()
  if (!SLUG_RE.test(clean)) return null
  if ((RESERVED_SLUGS as readonly string[]).includes(clean)) return null
  if (clean.startsWith('draft-')) return null
  return clean
}

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session.
 *
 * New flow: client passes { draft_slug, desired_slug }. We reserve
 * desired_slug against concurrent claims (30-minute TTL), then create the
 * Stripe session with metadata so the webhook can resolve the draft into a
 * claimed footprint after payment.
 *
 * Legacy: a single `slug` param is treated as desired_slug (no draft row
 * known) — retained for pre-draft callers. No reservation happens without
 * a desired_slug.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(checkoutSchema, body)
    if (!v.success) return v.response
    const { email, remix_source, remix_room, ref } = v.data

    const desired = normalizeSlug(v.data.desired_slug) || normalizeSlug(v.data.slug)
    const draftSlug = v.data.draft_slug || null

    if (!desired) {
      return NextResponse.json({ error: 'A valid slug is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // ── Conflict check: is the desired slug already claimed, or reserved? ──
    const { data: claimed } = await supabase
      .from('footprints')
      .select('username')
      .eq('username', desired)
      .not('edit_token', 'is', null)
      .maybeSingle()

    if (claimed) {
      return NextResponse.json({ error: 'That name is taken' }, { status: 409 })
    }

    // Clean up any expired reservations before checking.
    await supabase
      .from('slug_reservations')
      .delete()
      .lt('expires_at', new Date().toISOString())

    const { data: reserved } = await supabase
      .from('slug_reservations')
      .select('slug')
      .eq('slug', desired)
      .maybeSingle()

    if (reserved) {
      return NextResponse.json({ error: 'That name is being claimed right now' }, { status: 409 })
    }

    // ── SID attribution ──
    const cookieSid = request.cookies.get('fp_sid')?.value ?? null
    const bodySid = (body.sid && typeof body.sid === 'string') ? body.sid : null
    const rawSid = bodySid || cookieSid
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const validSid = rawSid && uuidRegex.test(rawSid) ? rawSid : null

    // ── Regional pricing ──
    const countryCode = request.headers.get('cf-ipcountry')
      || request.headers.get('x-vercel-ip-country')
      || 'US'
    const pricing = getPriceForCountry(countryCode)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'

    // New: land the user back on their claimed page with a polling overlay.
    const successUrl = `${baseUrl}/${encodeURIComponent(desired)}?claimed=true&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = draftSlug
      ? `${baseUrl}/${encodeURIComponent(draftSlug)}/home`
      : `${baseUrl}`

    // ── Create Stripe session first, then try to reserve. If reservation
    //    fails we expire the session by not honoring the webhook — cheap.
    //    But ordering matters: if we reserve before Stripe and Stripe throws,
    //    we'd hold a dead reservation. So we Stripe-first, reserve-second,
    //    and on reserve-failure we cancel the checkout session. ──
    let session
    try {
      session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card', 'link'],
        ...(email ? { customer_email: email } : {}),
        line_items: [
          {
            price_data: {
              currency: pricing.currency,
              product_data: {
                name: 'Footprint',
                description: `Publish footprint.onl/${desired}`,
              },
              unit_amount: pricing.amount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_creation: 'always',
        allow_promotion_codes: true,
        metadata: {
          product: 'footprint',
          desired_slug: desired,
          ...(draftSlug ? { draft_slug: draftSlug } : {}),
          ref: ref || '',
          ...(remix_source ? { remix_source } : {}),
          ...(remix_room ? { remix_room } : {}),
          ...(validSid ? { sid: validSid } : {}),
        },
        ...(validSid ? { client_reference_id: validSid } : {}),
      })
    } catch (error: any) {
      log.error({ err: error }, 'Stripe session creation failed')
      return NextResponse.json(
        { error: error?.message || 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    // Reserve AFTER Stripe succeeded. On a race at this step (someone else
    // reserved between our check and now), cancel the Stripe session so we
    // don't leak a paid checkout for a slug they can't claim.
    const { error: reserveError } = await supabase.from('slug_reservations').insert({
      slug: desired,
      stripe_session_id: session.id,
    })

    if (reserveError) {
      try {
        await getStripe().checkout.sessions.expire(session.id)
      } catch (e) {
        log.error({ err: e, sessionId: session.id }, 'Failed to expire Stripe session after reservation collision')
      }
      return NextResponse.json({ error: 'That name was just claimed' }, { status: 409 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    log.error({ err: error }, 'Checkout failed')
    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
