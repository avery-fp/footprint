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
 * Security:
 * - Validates Stripe session_id is paid
 * - Confirms slug matches metadata (prevents pay-for-X-publish-Y attack)
 * - Idempotent: safe to retry on failure
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { session_id, slug, draft } = body as {
      session_id: string
      slug: string
      draft: DraftFootprint
    }

    if (!session_id || !slug || !draft) {
      return NextResponse.json(
        { error: 'Missing required fields: session_id, slug, draft' },
        { status: 400 }
      )
    }

    // 1. Validate Stripe session
    let session
    try {
      session = await stripe.checkout.sessions.retrieve(session_id)
    } catch {
      return NextResponse.json(
        { error: 'Invalid session_id' },
        { status: 400 }
      )
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed' },
        { status: 402 }
      )
    }

    // 2. Validate slug matches metadata (prevent pay-for-X-publish-Y)
    if (session.metadata?.slug !== slug) {
      return NextResponse.json(
        { error: 'Slug mismatch - you can only publish the page you paid for' },
        { status: 403 }
      )
    }

    const email = session.customer_email || session.customer_details?.email
    if (!email) {
      return NextResponse.json(
        { error: 'No email found in payment session' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // 3. Get or create user
    let { data: user } = await supabase
      .from('users')
      .select('id, fp_number, serial_number')
      .eq('email', email.toLowerCase())
      .single()

    if (!user) {
      // Claim serial number for new user
      const { data: serialNumber, error: serialError } = await supabase.rpc('claim_next_serial')
      if (serialError) {
        console.error('Failed to claim serial:', serialError)
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        )
      }

      // Create user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          serial_number: serialNumber,
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
        })
        .select('id, fp_number, serial_number')
        .single()

      if (userError || !newUser) {
        console.error('Failed to create user:', userError)
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        )
      }
      user = newUser
    }

    // 4. Assign FP number if not already assigned (first publish only)
    let fpNumber = user.fp_number
    if (!fpNumber) {
      // Use serial_number as fp_number for simplicity
      // In production, you'd have a separate sequence
      fpNumber = user.serial_number

      await supabase
        .from('users')
        .update({ fp_number: fpNumber })
        .eq('id', user.id)
    }

    // 5. Upsert footprint (IDEMPOTENT via slug unique constraint)
    const { data: footprint, error: fpError } = await supabase
      .from('footprints')
      .upsert(
        {
          user_id: user.id,
          slug,
          name: draft.display_name || 'My Footprint',
          display_name: draft.display_name || null,
          handle: draft.handle || null,
          bio: draft.bio || null,
          theme: draft.theme || 'midnight',
          avatar_url: draft.avatar_url,
          is_primary: true,
          is_public: true, // Now public!
        },
        {
          onConflict: 'slug',
        }
      )
      .select('id')
      .single()

    if (fpError || !footprint) {
      console.error('Failed to create footprint:', fpError)
      return NextResponse.json(
        { error: 'Failed to create footprint' },
        { status: 500 }
      )
    }

    // 6. Delete existing content for idempotency
    await supabase
      .from('content')
      .delete()
      .eq('footprint_id', footprint.id)

    // 7. Insert all content in one batch
    if (draft.content && draft.content.length > 0) {
      const contentRows = draft.content.map((item, index) => ({
        footprint_id: footprint.id,
        url: item.url,
        type: item.type,
        title: item.title,
        description: item.description,
        thumbnail_url: item.thumbnail_url,
        embed_html: item.embed_html,
        position: index,
      }))

      const { error: contentError } = await supabase
        .from('content')
        .insert(contentRows)

      if (contentError) {
        console.error('Failed to save content:', contentError)
        return NextResponse.json(
          { error: 'Failed to save content' },
          { status: 500 }
        )
      }
    }

    // 8. Record payment (idempotent via unique constraint)
    await supabase.from('payments').upsert(
      {
        user_id: user.id,
        stripe_session_id: session.id,
        stripe_payment_intent: typeof session.payment_intent === 'string'
          ? session.payment_intent
          : null,
        amount: session.amount_total,
        currency: session.currency,
        status: 'completed',
      },
      {
        onConflict: 'stripe_session_id',
        ignoreDuplicates: true,
      }
    )

    console.log(`✓ Published footprint: ${slug} for ${email} (FP #${fpNumber})`)

    return NextResponse.json({
      success: true,
      fp_number: fpNumber,
      slug,
    })
  } catch (error) {
    console.error('Import draft error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
