import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * POST /api/auth/oauth
 *
 * Initiates OAuth flow via Supabase Auth for Apple or Google.
 * Uses PKCE so the auth code comes back as a query param (not a hash fragment)
 * which the server-side callback route can read.
 *
 * Stores the PKCE code_verifier in an httpOnly cookie so the callback
 * can exchange the code.
 */
export async function POST(request: NextRequest) {
  try {
    const { provider, redirect } = await request.json()

    if (!provider || !['google', 'apple'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'OAuth not configured' }, { status: 500 })
    }

    // Generate PKCE code_verifier and code_challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')

    // Build callback URL with optional post-auth redirect
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'
    const callbackUrl = new URL('/auth/callback', baseUrl)
    if (redirect && typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
      callbackUrl.searchParams.set('redirect', redirect)
    }

    // Build Supabase authorize URL with PKCE
    const authUrl = new URL(`${supabaseUrl}/auth/v1/authorize`)
    authUrl.searchParams.set('provider', provider)
    authUrl.searchParams.set('redirect_to', callbackUrl.toString())
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 's256')

    if (provider === 'google') {
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
    }

    const response = NextResponse.json({ url: authUrl.toString() })

    // Store code_verifier in httpOnly cookie for the callback to use
    response.cookies.set('pkce_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    })

    return response
  } catch (err) {
    console.error('[oauth] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
