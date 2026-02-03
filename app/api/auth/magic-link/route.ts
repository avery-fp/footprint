import { NextRequest, NextResponse } from 'next/server'
import { generateMagicLink, sendMagicLinkEmail } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/magic-link
 *
 * Generates and sends a magic link for passwordless auth.
 *
 * Flow:
 * 1. User submits email
 * 2. We check if they're a valid user (have paid)
 * 3. Generate a secure, time-limited token
 * 4. Send them an email with the magic link
 *
 * If they haven't paid yet, we let them know they need to first.
 *
 * NOTE: Uses service role to bypass RLS for user lookup.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email: rawEmail, redirect } = body

    if (!rawEmail) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Normalize email
    const email = rawEmail.toLowerCase().trim()

    // Use service role client to bypass RLS for user lookup
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user exists (i.e., has paid)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()

    if (userError || !user) {
      // User hasn't paid yet
      return NextResponse.json(
        { error: 'No account found. Get your Footprint first!' },
        { status: 404 }
      )
    }

    // Generate the magic link
    const magicLink = await generateMagicLink(email)

    // Add redirect param if provided
    const finalLink = redirect
      ? `${magicLink}&redirect=${encodeURIComponent(redirect)}`
      : magicLink

    // Send the email
    await sendMagicLinkEmail(email, finalLink)

    return NextResponse.json({ success: true })

  } catch (error) {
    // Log the full error object to see what's really happening
    console.error('Magic link error - FULL DETAILS:', error)
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }

    // Return the specific error message instead of generic one
    const errorMessage = error instanceof Error ? error.message : 'Failed to send magic link'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
