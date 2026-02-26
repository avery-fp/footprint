import { NextRequest, NextResponse } from 'next/server'
import { verifyOTP } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/auth/verify-code
 *
 * Verifies a 6-digit OTP code + email → creates session.
 * Body: { email, code }
 */
export async function POST(request: NextRequest) {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { email, code } = body

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    const result = await verifyOTP(email, code)

    if (!result) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
    }

    const { user, sessionToken } = result

    // Find user's primary footprint slug
    const supabase = createServerSupabaseClient()
    const { data: primaryFp } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    const response = NextResponse.json({
      success: true,
      slug: primaryFp?.username || null,
    })

    const hostname = new URL(request.url).hostname
    const cookieDomain = hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
      ? '.footprint.onl'
      : undefined

    response.cookies.set('fp_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    })

    return response

  } catch (error) {
    console.error('Code verification error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
