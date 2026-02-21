import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLink } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { setSessionCookie } from '@/lib/cookies'

/**
 * POST /api/auth/verify
 * 
 * Verifies a magic link token and creates a session.
 * 
 * This is where the magic completes:
 * 1. User clicked the link in their email
 * 2. We verify the token is valid and not expired
 * 3. Create a session token (JWT)
 * 4. Set it as an HTTP-only cookie
 * 5. They're now logged in
 * 
 * The cookie approach is secure because:
 * - HTTP-only: JavaScript can't access it
 * - Secure: Only sent over HTTPS
 * - SameSite: Prevents CSRF attacks
 */
export async function POST(request: NextRequest) {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Verify the magic link and get session
    const result = await verifyMagicLink(token)

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired link' },
        { status: 401 }
      )
    }

    const { user, sessionToken } = result

    // Find user's primary footprint slug for direct redirect to editor
    const supabase = createServerSupabaseClient()
    const { data: primaryFp } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      slug: primaryFp?.username || null,
      user: {
        id: user.id,
        email: user.email,
        serial_number: user.serial_number,
      },
    })

    setSessionCookie(response, sessionToken, new URL(request.url).hostname)

    return response

  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    )
  }
}
