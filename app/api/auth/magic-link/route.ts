import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/magic-link
 *
 * Sends a magic link email via Supabase Auth.
 * This is the email-only fallback for users who can't use OAuth or passkeys.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body?.email || '').toLowerCase().trim()
    const redirect = String(body?.redirect || '')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Build the callback URL with optional redirect
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'
    const callbackUrl = new URL('/auth/callback', baseUrl)
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      callbackUrl.searchParams.set('redirect', redirect)
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: true,
      },
    })

    if (error) {
      console.error('[magic-link] Supabase error:', error)
      return NextResponse.json({ error: 'Could not send link. Try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[magic-link] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
