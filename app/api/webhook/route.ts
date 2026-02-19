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

  // Handle remix: clone room content from source footprint
  const remixSource = session.metadata?.remix_source
  const remixRoom = session.metadata?.remix_room

  if (remixSource) {
    try {
      await cloneRemixContent(supabase, remixSource, remixRoom, serialNumber, slug)
      console.log(`✓ Remix from ${remixSource} → #${serialNumber}`)
    } catch (err) {
      console.error('Remix clone failed:', err)
    }
  }

  // Track conversion from UTM if present
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
      console.error('Conversion tracking failed:', err)
    }
  }

  console.log(`✓ New user: ${email} #${serialNumber}`)

  // Send welcome email — fire-and-forget, don't block webhook response
  sendWelcomeEmail(email, serialNumber, username)
    .then(() => console.log(`✓ Welcome email sent: ${email}`))
    .catch((err) => console.error(`⚠ Welcome email failed for ${email}:`, err))
}

/**
 * Clone content from a source footprint to a new user's footprint.
 * Powers the remix/clone mechanic — every buyer becomes a distribution node.
 */
async function cloneRemixContent(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  sourceSlug: string,
  roomName: string | null,
  targetSerialNumber: number,
  targetSlug: string
) {
  // Get source footprint
  const { data: source } = await supabase
    .from('footprints')
    .select('serial_number')
    .eq('username', sourceSlug)
    .single()

  if (!source) return

  const sourceSerial = source.serial_number

  // Get source rooms
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
    // Create new room for target user
    const { data: newRoom } = await supabase
      .from('rooms')
      .insert({
        serial_number: targetSerialNumber,
        name: sourceRoom.name,
        position: sourceRoom.position,
      })
      .select()
      .single()

    if (!newRoom) continue

    // Clone images (library) — points to same storage URLs
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

    // Clone links/embeds
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

  // Track remix in distribution events
  await supabase.from('fp_distribution_events').insert({
    serial_number: sourceSerial,
    channel: 'remix',
    surface: `remix by #${targetSerialNumber}`,
    notes: `Cloned to ${targetSlug} from ${sourceSlug}`,
  }).catch(() => {}) // Non-critical, don't fail the purchase
}
