import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Import Draft API
 *
 * Atomic endpoint to persist a localStorage draft to Supabase after payment.
 * Called from /success page after Stripe checkout completes.
 */

interface DraftContent {
  id: string
  url: string
  type: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  embed_html: string | null
  position: number
}

interface DraftFootprint {
  slug: string
  display_name: string
  handle: string
  bio: string
  theme: string
  avatar_url: string | null
  content: DraftContent[]
}

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

    // 1. Validate Stripe session
    let session
    try {
      session = await stripe.checkout.sessions.retrieve(session_id)
    } catch {
      return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 })
    }

    // 2. Validate slug matches metadata (prevent pay-for-X-publish-Y)
    if (session.metadata?.slug !== slug) {
      return NextResponse.json({ error: 'Slug mismatch' }, { status: 403 })
    }

    const email = session.customer_email || session.customer_details?.email
    if (!email) {
      return NextResponse.json({ error: 'No email in session' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // 3. Determine serial_number via purchases (idempotency anchor)
    const { data: existingPurchase } = await supabase
      .from('purchases')
      .select('serial_number')
      .eq('stripe_session_id', session_id)
      .single()

    let serialNumber: number
    let isRetry = false

    if (existingPurchase) {
      // Session already processed - reuse serial_number
      serialNumber = existingPurchase.serial_number
      isRetry = true
    } else {
      // Claim next serial_number
      const { data: serialData, error: serialError } = await supabase.rpc('get_next_serial')
      if (serialError || !serialData) {
        console.error('Failed to get serial:', serialError)
        return NextResponse.json({ error: 'Failed to allocate serial number' }, { status: 500 })
      }
      serialNumber = serialData as number
    }

    // 4. Slug collision protection
    const { data: existingFp } = await supabase
      .from('footprints')
      .select('user_id')
      .eq('slug', slug)
      .single()

    // Get or create user
    const { data: user, error: userQueryError } = await supabase
      .from('users')
      .select('id, serial_number')
      .eq('email', email.toLowerCase())
      .single()

    let userId: string

    if (!user) {
      // Create new user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          serial_number: serialNumber,
        })
        .select('id')
        .single()

      if (userError || !newUser) {
        console.error('Failed to create user:', userError)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }
      userId = newUser.id
    } else {
      userId = user.id
    }

    if (existingFp && existingFp.user_id !== userId) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    }

    // 5. Idempotent delete before insert (safe retry)
    await supabase.from('library').delete().eq('serial_number', serialNumber)
    await supabase.from('links').delete().eq('serial_number', serialNumber)

    // 6. Upsert footprint
    const { data: footprint, error: fpError } = await supabase
      .from('footprints')
      .upsert({
        user_id: userId,
        slug: slug,
        name: draft.display_name || 'Untitled',
        display_name: draft.display_name || null,
        handle: draft.handle || null,
        theme: draft.theme || 'midnight',
        bio: draft.bio || null,
        is_public: true,
        avatar_url: draft.avatar_url || null,
        is_primary: true,
      }, { onConflict: 'user_id,slug' })
      .select('id')
      .single()

    if (fpError || !footprint) {
      console.error('Failed to upsert footprint:', fpError)
      return NextResponse.json({ error: 'Failed to create footprint' }, { status: 500 })
    }

    // 7. Insert purchase record if new (unique on stripe_session_id)
    if (!isRetry) {
      const { error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          email: email.toLowerCase(),
          serial_number: serialNumber,
          stripe_session_id: session_id,
          amount_cents: session.amount_total || 1000,
          status: 'completed',
        })

      if (purchaseError) {
        console.error('Failed to record purchase:', purchaseError)
      }
    }

    // 8. Insert into library table (images)
    const imageItems = draft.content.filter(item => item.type === 'image')
    if (imageItems.length > 0) {
      const libraryRows = imageItems.map((item, index) => ({
        serial_number: serialNumber,
        image_url: item.url,
        title: item.title,
        description: item.description,
        position: index,
      }))
      await supabase.from('library').insert(libraryRows)
    }

    // 9. Insert into links table (embeds/urls)
    const linkItems = draft.content.filter(item => item.type !== 'image')
    if (linkItems.length > 0) {
      const linkRows = linkItems.map((item, index) => ({
        serial_number: serialNumber,
        platform: item.type,
        url: item.url,
        embed_url: item.embed_html ? item.url : null,
        title: item.title,
        position: index,
        thumbnail: item.thumbnail_url,
        description: item.description,
        metadata: {
          description: item.description,
          embed_html: item.embed_html,
        },
      }))
      await supabase.from('links').insert(linkRows)
    }

    console.log(`✓ Published: ${slug} (FP #${serialNumber}) for ${email}`)

    return NextResponse.json({
      success: true,
      serial_number: serialNumber,
      slug: slug,
    })
  } catch (error) {
    console.error('Import draft error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
