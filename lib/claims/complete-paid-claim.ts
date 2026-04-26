import { createServerSupabaseClient } from '@/lib/supabase'
import { sendWelcomeEmail, normalizeEmail } from '@/lib/auth'
import { routeLogger } from '@/lib/logger'
import { RESERVED_SLUGS } from '@/lib/constants'

/**
 * Shared paid-claim promotion logic.
 *
 * Two callers:
 *  1. POST /api/webhook  — Stripe checkout.session.completed webhook (backup).
 *  2. POST /api/claim/complete — synchronous return-from-Stripe path (primary).
 *
 * Either path can fire first; the function is idempotent on
 * payments.stripe_session_id. The synchronous path is the user-facing one;
 * the webhook is purely a safety net for cases where the user closes the
 * tab before the redirect lands.
 *
 * Returns the final slug + edit_token so callers can immediately cookie
 * the user in. Throws nothing — failures come back as { ok: false, ... }.
 */

const log = routeLogger('CLAIM', 'complete-paid-claim')
const SLUG_RE = /^[a-z0-9-]{1,40}$/

function isValidDesiredSlug(s: string | undefined | null): s is string {
  if (!s) return false
  const clean = s.toLowerCase().trim()
  if (!SLUG_RE.test(clean)) return false
  if ((RESERVED_SLUGS as readonly string[]).includes(clean)) return false
  if (clean.startsWith('draft-')) return false
  return true
}

export type ClaimSuccess = {
  ok: true
  slug: string
  edit_token: string
  serial_number: number
  alreadyProcessed: boolean
}

export type ClaimFailure = {
  ok: false
  error: string
  status: number
  detail?: string
}

export type ClaimResult = ClaimSuccess | ClaimFailure

export async function completePaidClaimFromCheckoutSession(session: any): Promise<ClaimResult> {
  const supabase = createServerSupabaseClient()
  const rawEmail = session?.customer_email || session?.customer_details?.email
  if (!rawEmail) {
    return { ok: false, error: 'no_email', status: 400, detail: 'No email on Stripe session' }
  }
  const email = normalizeEmail(rawEmail)

  // ── Idempotency: already processed? Look up the existing claim. ──
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('user_id')
    .eq('stripe_session_id', session.id)
    .maybeSingle()

  if (existingPayment?.user_id) {
    const { data: existing } = await supabase
      .from('footprints')
      .select('username, edit_token, serial_number')
      .eq('user_id', existingPayment.user_id)
      .not('edit_token', 'is', null)
      .order('serial_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing?.username && existing?.edit_token) {
      return {
        ok: true,
        slug: existing.username,
        edit_token: existing.edit_token,
        serial_number: existing.serial_number,
        alreadyProcessed: true,
      }
    }
    // Payment row exists but no published footprint — fall through and
    // attempt to complete. Could happen if a prior run crashed between
    // payment insert and footprint write (we insert footprint first now,
    // but defensive).
  }

  const desiredSlugRaw = session.metadata?.desired_slug || session.metadata?.slug || null
  const draftSlug = session.metadata?.draft_slug || null
  const sid: string | null = session.metadata?.sid || session.client_reference_id || null

  if (!isValidDesiredSlug(desiredSlugRaw)) {
    return { ok: false, error: 'invalid_desired_slug', status: 400, detail: `Session ${session.id}` }
  }
  const desiredSlug = desiredSlugRaw as string

  // ── 1. Look up the draft first. Its serial_number is the PK of the
  //      row we'll promote, so we MUST reuse it — we cannot mutate a PK
  //      that five other tables FK into. If no draft: we'll claim a new
  //      serial below. ──
  let draftRow: { serial_number: number } | null = null
  if (draftSlug) {
    const { data } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', draftSlug)
      .maybeSingle()
    if (data?.serial_number != null) {
      draftRow = { serial_number: data.serial_number }
    }
  }

  // ── 2. Resolve user. Use the draft's serial if we have one; otherwise
  //      claim a fresh serial for a brand-new user. Existing users keep
  //      their own serial (one user = one serial). ──
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, serial_number')
    .ilike('email', email)
    .maybeSingle()

  let userId: string
  let serialNumber: number

  if (existingUser) {
    userId = existingUser.id
    serialNumber = draftRow?.serial_number ?? existingUser.serial_number
  } else if (draftRow) {
    serialNumber = draftRow.serial_number

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        serial_number: serialNumber,
        stripe_customer_id: session.customer || null,
        referred_by: session.metadata?.ref || null,
        gifts_remaining: 2,
      })
      .select()
      .single()

    if (userError || !newUser) {
      const { data: raceUser } = await supabase
        .from('users')
        .select('id, serial_number')
        .ilike('email', email)
        .maybeSingle()
      if (!raceUser) {
        return { ok: false, error: 'user_create_failed', status: 500, detail: userError?.message }
      }
      userId = raceUser.id
      serialNumber = raceUser.serial_number
    } else {
      userId = newUser.id
    }
  } else {
    const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
    if (serialError || !serialData) {
      return { ok: false, error: 'serial_claim_failed', status: 500, detail: serialError?.message }
    }
    serialNumber = serialData as number

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        serial_number: serialNumber,
        stripe_customer_id: session.customer || null,
        referred_by: session.metadata?.ref || null,
        gifts_remaining: 2,
      })
      .select()
      .single()

    if (userError || !newUser) {
      const { data: raceUser } = await supabase
        .from('users')
        .select('id, serial_number')
        .ilike('email', email)
        .maybeSingle()
      if (!raceUser) {
        return { ok: false, error: 'user_create_failed', status: 500, detail: userError?.message }
      }
      userId = raceUser.id
      serialNumber = raceUser.serial_number
    } else {
      userId = newUser.id
    }
  }

  // ── 3. Decide final slug. If someone else won the race, fall back. ──
  const { data: slugHolder } = await supabase
    .from('footprints')
    .select('username, user_id, edit_token')
    .eq('username', desiredSlug)
    .maybeSingle()

  let finalSlug = desiredSlug
  let collisionFallback = false

  if (slugHolder && slugHolder.edit_token && slugHolder.user_id && slugHolder.user_id !== userId) {
    finalSlug = `${desiredSlug}-${serialNumber}`
    collisionFallback = true
    log.info(`Slug collision on ${desiredSlug}; falling back to ${finalSlug} for user ${userId}`)
  }

  const editToken = (globalThis as any).crypto?.randomUUID?.()
    ?? require('crypto').randomUUID()

  // ── 4. Promote draft OR create claimed footprint ──
  let footprintWritten = false

  if (draftSlug && draftRow) {
    const { error: updError } = await supabase
      .from('footprints')
      .update({
        user_id: userId,
        username: finalSlug,
        edit_token: editToken,
        published: true,
        is_primary: true,
      })
      .eq('username', draftSlug)

    if (updError) {
      log.error({ err: updError }, 'Draft promotion failed')
    } else {
      footprintWritten = true
    }
  }

  if (!footprintWritten) {
    const { error: insError } = await supabase.from('footprints').insert({
      user_id: userId,
      username: finalSlug,
      serial_number: serialNumber,
      edit_token: editToken,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      published: true,
    })

    if (insError) {
      if (draftSlug) {
        const { error: updError } = await supabase
          .from('footprints')
          .update({
            user_id: userId,
            username: finalSlug,
            edit_token: editToken,
            published: true,
            is_primary: true,
          })
          .eq('username', draftSlug)

        if (updError) {
          return {
            ok: false,
            error: 'footprint_write_failed',
            status: 500,
            detail: `${insError.message} / ${updError.message}`,
          }
        }
      } else {
        return { ok: false, error: 'footprint_insert_failed', status: 500, detail: insError.message }
      }
    }
  }

  // ── 5. Record payment (idempotency anchor). On unique conflict
  //      (parallel webhook + /claim/complete) we silently ignore. ──
  const { error: payError } = await supabase.from('payments').insert({
    user_id: userId,
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent,
    amount: session.amount_total,
    currency: session.currency,
    status: 'completed',
  })

  if (payError && !/duplicate key/i.test(payError.message || '')) {
    log.error({ err: payError }, 'Payment record insert failed')
  }

  // ── 6. Release reservation ──
  await supabase
    .from('slug_reservations')
    .delete()
    .eq('slug', desiredSlug)

  // ── ARO attribution (non-critical) ──
  if (sid) {
    await recordAroEvent(supabase, existingUser ? 'purchase' : 'signup', sid)
    if (!existingUser) {
      await recordAroEvent(supabase, 'purchase', sid, session.id, session.amount_total, session.currency, email)
    }
  }

  // ── Remix clone (non-critical) ──
  const remixSource = session.metadata?.remix_source
  const remixRoom = session.metadata?.remix_room
  if (remixSource) {
    try {
      await cloneRemixContent(supabase, remixSource, remixRoom, serialNumber, finalSlug)
      log.info(`Remix from ${remixSource} to #${serialNumber}`)
    } catch (err) {
      log.error({ err }, 'Remix clone failed')
    }
  }

  // ── Conversion tracking from UTM ──
  const utmChannel = session.metadata?.utm_channel
  const utmPack = session.metadata?.utm_pack
  if (utmChannel && utmPack) {
    try {
      const { data: matchingEvents } = await supabase
        .from('fp_distribution_events')
        .select('id, conversions')
        .eq('pack_id', utmPack)
        .eq('channel', utmChannel)
        .order('posted_at', { ascending: false })
        .limit(1)
      if (matchingEvents && matchingEvents.length > 0) {
        await supabase
          .from('fp_distribution_events')
          .update({ conversions: (matchingEvents[0].conversions || 0) + 1 })
          .eq('id', matchingEvents[0].id)
      }
    } catch (err) {
      log.error({ err }, 'Conversion tracking failed')
    }
  }

  // ── Referral tracking ──
  const refCode = session.metadata?.ref
  if (refCode) {
    const refSerial = parseInt(refCode.replace('FP-', ''), 10)
    if (!isNaN(refSerial)) {
      try {
        await supabase.from('referrals').insert({
          referrer_serial: refSerial,
          referred_user_id: userId,
          referral_code: refCode,
          converted: true,
        })
      } catch { /* non-critical */ }
    }
  }

  try {
    await supabase.from('fp_events').insert({
      footprint_id: userId,
      event_type: 'conversion',
      data: {
        serial_number: serialNumber,
        amount: session.amount_total,
        ref: refCode || null,
        source: 'stripe',
      },
    })
  } catch { /* non-critical */ }

  log.info(`Claim complete: ${email} #${serialNumber} /${finalSlug}${collisionFallback ? ' (fallback)' : ''}`)

  // ── Welcome email (fire-and-forget) ──
  sendWelcomeEmail(email, { slug: finalSlug, editToken, serialNumber })
    .then(() => log.info(`Welcome email sent: ${email}`))
    .catch((err) => log.error({ err }, `Welcome email failed for ${email}`))

  return {
    ok: true,
    slug: finalSlug,
    edit_token: editToken,
    serial_number: serialNumber,
    alreadyProcessed: false,
  }
}

async function recordAroEvent(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  eventType: 'signup' | 'purchase',
  sid: string,
  stripeSessionId?: string,
  amount?: number | null,
  currency?: string | null,
  customerEmail?: string,
) {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isValidUuid = uuidRegex.test(sid)
    const metadata: Record<string, unknown> = { sid }
    if (eventType === 'purchase') {
      metadata.stripe_session_id = stripeSessionId || null
      metadata.amount = amount || 0
      metadata.currency = currency || 'usd'
      metadata.customer_email = customerEmail || null
    }
    const { error } = await supabase.from('aro_events').insert({
      target_id: isValidUuid ? sid : null,
      event_type: eventType,
      metadata,
    })
    if (error) {
      log.error({ err: error, sid, eventType }, `ARO ${eventType} event insert failed`)
    }
  } catch (err) {
    log.error({ err, sid, eventType }, `ARO ${eventType} event failed`)
  }
}

async function cloneRemixContent(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  sourceSlug: string,
  roomName: string | null,
  targetSerialNumber: number,
  targetSlug: string
) {
  const { data: source } = await supabase
    .from('footprints')
    .select('serial_number')
    .eq('username', sourceSlug)
    .single()
  if (!source) return
  const sourceSerial = source.serial_number

  let sourceRooms
  if (roomName) {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', sourceSerial)
      .eq('name', roomName)
    sourceRooms = data
  } else {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', sourceSerial)
      .neq('hidden', true)
      .order('position')
      .limit(5)
    sourceRooms = data
  }
  if (!sourceRooms || sourceRooms.length === 0) return

  for (const sourceRoom of sourceRooms) {
    const { data: newRoom } = await supabase
      .from('rooms')
      .insert({ serial_number: targetSerialNumber, name: sourceRoom.name, position: sourceRoom.position })
      .select()
      .single()
    if (!newRoom) continue

    const { data: sourceImages } = await supabase
      .from('library')
      .select('*')
      .eq('serial_number', sourceSerial)
      .eq('room_id', sourceRoom.id)
    if (sourceImages) {
      for (const img of sourceImages) {
        await supabase.from('library').insert({
          serial_number: targetSerialNumber,
          image_url: img.image_url,
          position: img.position,
          room_id: newRoom.id,
          size: img.size || 1,
        })
      }
    }

    const { data: sourceLinks } = await supabase
      .from('links')
      .select('*')
      .eq('serial_number', sourceSerial)
      .eq('room_id', sourceRoom.id)
    if (sourceLinks) {
      for (const link of sourceLinks) {
        await supabase.from('links').insert({
          serial_number: targetSerialNumber,
          url: link.url,
          platform: link.platform,
          title: link.title,
          metadata: link.metadata,
          thumbnail: link.thumbnail,
          position: link.position,
          room_id: newRoom.id,
          size: link.size || 1,
        })
      }
    }
  }

  try {
    await supabase.from('fp_distribution_events').insert({
      serial_number: sourceSerial,
      channel: 'remix',
      surface: `remix by #${targetSerialNumber}`,
      notes: `Cloned to ${targetSlug} from ${sourceSlug}`,
    })
  } catch { /* non-critical */ }
}
