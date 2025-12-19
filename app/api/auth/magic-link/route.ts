import { NextRequest, NextResponse } from 'next/server'
import { generateMagicLink, sendMagicLinkEmail } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

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
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, redirect } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Check if user exists (i.e., has paid)
    const supabase = createServerSupabaseClient()
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single()

    if (!user) {
      // User hasn't paid yet
      return NextResponse.json(
        { error: 'No account found. Get your Footprint first!' },
        { status: 404 }
      )
    }

    // Generate the magic link
    const magicLink = await generateMagicLink(email.toLowerCase())
    
    // Add redirect param if provided
    const finalLink = redirect 
      ? `${magicLink}&redirect=${encodeURIComponent(redirect)}`
      : magicLink

    // Send the email
    await sendMagicLinkEmail(email, finalLink)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Magic link error:', error)
    return NextResponse.json(
      { error: 'Failed to send magic link' },
      { status: 500 }
    )
  }
}
