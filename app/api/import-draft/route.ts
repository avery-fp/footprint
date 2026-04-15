import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, normalizeEmail } from '@/lib/auth'
import { RESERVED_SLUGS } from '@/lib/constants'
import type { DraftFootprint } from '@/lib/draft-store'

/**
 * Import Draft API
 *
 * Persists a localStorage draft to Supabase after Stripe payment.
 * Called from /success page after checkout completes.
 *
 * Coordinates with the Stripe webhook:
 * - Webhook may have already created user + footprint (race condition)
 * - This route is idempotent — safe to call multiple times
 * - Uses payments.stripe_session_id as idempotency anchor
 */
export async function POST(request: NextRequest) {
  try {
    const { session_id, slug, draft } = await request.json() as {
      session_id: string
      slug: string
      draft: DraftFootprint
    }

    if (!session_id || !slug || !draft) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate slug format
    const slugClean = slug.toLowerCase().trim()
    if (!/^[a-z0-9-]{1,40}$/.test(slugClean) || (RESERVED_SLUGS as readonly string[]).includes(slugClean)) {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
    }

    // 1. Validate Stripe session
    let session
    try {
      session = await getStripe().checkout.sessions.retrieve(session_id)
    } catch {
      return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }

    const email = session.customer_email || session.customer_details?.email
    if (!email) {
      return NextResponse.json({ error: 'No email in session' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // 2. Check if webhook already processed this payment
    //    payments table has stripe_session_id (UNIQUE) — our idempotency anchor
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('user_id')
      .eq('stripe_session_id', session_id)
      .single()

    let serialNumber: number
    let userId: string

    if (existingPayment) {
      // Webhook already ran — get serial from user record
      const { data: user } = await supabase
        .from('users')
        .select('serial_number, id')
        .eq('id', existingPayment.user_id)
        .single()

      if (!user || !user.serial_number) {
        return NextResponse.json({ error: 'User record incomplete' }, { status: 500 })
      }
      serialNumber = user.serial_number
      userId = user.id
    } else {
      // Webhook hasn't fired yet — check if user exists by email
      const { data: existingUser } = await supabase
        .from('users')
        .select('serial_number, id')
        .ilike('email', normalizeEmail(email))
        .single()

      if (existingUser && existingUser.serial_number) {
        serialNumber = existingUser.serial_number
        userId = existingUser.id
      } else {
        // No user exists yet — claim serial and create user
        const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
        if (serialError || !serialData) {
          console.error('Failed to claim serial:', serialError)
          return NextResponse.json({ error: 'Failed to allocate serial number' }, { status: 500 })
        }
        serialNumber = serialData as number

        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            email: normalizeEmail(email),
            serial_number: serialNumber,
            stripe_customer_id: session.customer || null,
          })
          .select('id')
          .single()

        if (userError || !newUser) {
          // Race condition: webhook may have created the user between our check and insert.
          // Retry lookup before giving up.
          const { data: raceUser } = await supabase
            .from('users')
            .select('serial_number, id')
            .ilike('email', normalizeEmail(email))
            .single()

          if (raceUser && raceUser.serial_number) {
            serialNumber = raceUser.serial_number
            userId = raceUser.id
          } else {
            console.error('Failed to create user:', userError)
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
          }
        } else {
          userId = newUser.id
        }

        // Record payment (ignore conflict if webhook already inserted it)
        await supabase.from('payments').upsert({
          user_id: userId,
          stripe_session_id: session_id,
          stripe_payment_intent: session.payment_intent,
          amount: session.amount_total || 1000,
          currency: session.currency || 'usd',
          status: 'completed',
        }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })
      }
    }

    // 3. Slug collision protection
    const { data: existingFp } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (existingFp && existingFp.serial_number !== serialNumber) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    }

    // 4. Only import tiles if the user hasn't already added content manually.
    //    Prevents wiping content on duplicate calls or if user edited between checkout and success page.
    const [{ count: libCount }, { count: linkCount }] = await Promise.all([
      supabase.from('library').select('id', { count: 'exact', head: true }).eq('serial_number', serialNumber),
      supabase.from('links').select('id', { count: 'exact', head: true }).eq('serial_number', serialNumber),
    ])
    const hasExistingContent = (libCount ?? 0) > 0 || (linkCount ?? 0) > 0

    // 5. Upsert footprint — update if webhook already created it
    const { error: fpError } = await supabase
      .from('footprints')
      .upsert({
        user_id: userId,
        serial_number: serialNumber,
        username: slug,
        name: draft.display_title || draft.display_name || 'Everything',
        display_title: draft.display_title || null,
        display_name: draft.display_name || null,
        handle: draft.handle || null,
        dimension: draft.theme || 'midnight',
        bio: draft.bio || null,
        published: true,
      }, { onConflict: 'serial_number' })

    if (fpError) {
      console.error('Failed to upsert footprint:', fpError)
      return NextResponse.json({ error: 'Failed to create footprint' }, { status: 500 })
    }

    // 6. Import draft tiles only if the user has no existing content
    if (!hasExistingContent && draft.content && draft.content.length > 0) {
      const imageItems = draft.content.filter(item => item.type === 'image')
      if (imageItems.length > 0) {
        const libraryRows = imageItems.map((item, index) => ({
          serial_number: serialNumber,
          // Strip embedded whitespace — see app/api/tiles/route.ts for details
          image_url: (item.url || '').replace(/[\n\r]+/g, '').trim(),
          position: index,
        }))
        const { error: libError } = await supabase.from('library').insert(libraryRows)
        if (libError) {
          console.error('Failed to insert library tiles:', libError)
          return NextResponse.json({ error: 'Failed to save images' }, { status: 500 })
        }
      }

      const linkItems = draft.content.filter(item => item.type !== 'image')
      if (linkItems.length > 0) {
        const linkRows = linkItems.map((item, index) => ({
          serial_number: serialNumber,
          platform: item.type,
          url: item.url,
          title: item.title,
          position: index,
          thumbnail: item.thumbnail_url,
          metadata: {
            description: item.description,
            embed_html: item.embed_html,
          },
        }))
        const { error: linkError } = await supabase.from('links').insert(linkRows)
        if (linkError) {
          console.error('Failed to insert link tiles:', linkError)
          return NextResponse.json({ error: 'Failed to save links' }, { status: 500 })
        }
      }
    }

    // Auto-sign in the user by setting session cookie
    const sessionToken = await createSessionToken(userId, normalizeEmail(email))

    const response = NextResponse.json({
      success: true,
      serial_number: serialNumber,
      slug: slug,
    })

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

    return response
  } catch (error) {
    console.error('Import draft error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
