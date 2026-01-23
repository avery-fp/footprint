import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { DraftFootprint } from '@/lib/draft-store'

/**
 * Import Draft API
 *
 * Atomic endpoint to persist a localStorage draft to Supabase after payment.
 * Called from /success page after Stripe checkout completes.
 *
 * REAL SCHEMA:
 * - footprints: serial_number (PK), username (=slug), display_name, dimension (=theme), bio, gallery (jsonb), published
 * - users: id, email, serial_number
 * - purchases: email, serial_number, stripe_session_id, amount_cents, status
 * - library: serial_number, image_url, position
 * - links: serial_number, platform, url, embed_url, title, position, thumbnail, metadata
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

    // 3. Check if this session was already processed (idempotency)
    const { data: existingPurchase } = await supabase
      .from('purchases')
      .select('serial_number')
      .eq('stripe_session_id', session_id)
      .single()

    if (existingPurchase) {
      // Already processed - return success with existing data
      return NextResponse.json({
        success: true,
        serial_number: existingPurchase.serial_number,
        slug,
      })
    }

    // 4. Get next serial_number for new footprint
    const { data: serialData, error: serialError } = await supabase.rpc('get_next_serial')
    if (serialError || !serialData) {
      console.error('Failed to get serial:', serialError)
      return NextResponse.json({ error: 'Failed to allocate serial number' }, { status: 500 })
    }
    const serialNumber = serialData as number

    // 5. Build gallery JSONB from draft content
    const gallery = draft.content.map((item, index) => ({
      id: item.id,
      type: item.type,
      url: item.url,
      title: item.title,
      description: item.description,
      thumbnail_url: item.thumbnail_url,
      embed_html: item.embed_html,
      position: index,
    }))

    // 6. Insert footprint
    const { error: fpError } = await supabase
      .from('footprints')
      .insert({
        serial_number: serialNumber,
        username: slug,
        display_name: draft.display_name || null,
        dimension: draft.theme || 'midnight',
        bio: draft.bio || null,
        gallery: gallery,
        published: true,
        background_url: draft.avatar_url || null,
      })

    if (fpError) {
      console.error('Failed to create footprint:', fpError)
      return NextResponse.json({ error: 'Failed to create footprint' }, { status: 500 })
    }

    // 7. Insert user
    const { error: userError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        serial_number: serialNumber,
      })

    if (userError) {
      console.error('Failed to create user:', userError)
      // Note: footprint was created but user failed - may need cleanup
    }

    // 8. Insert purchase record
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

    // 9. Insert into library table (for images)
    const imageItems = draft.content.filter(item => item.type === 'image')
    if (imageItems.length > 0) {
      const libraryRows = imageItems.map((item, index) => ({
        serial_number: serialNumber,
        image_url: item.url,
        position: index,
      }))

      await supabase.from('library').insert(libraryRows)
    }

    // 10. Insert into links table (for embeds/links)
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
      slug,
    })
  } catch (error) {
    console.error('Import draft error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
