import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '@/lib/auth'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/auth/session')

// IP rate limit: 20 attempts per 15 min
const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const IP_MAX_ATTEMPTS = 20
const IP_WINDOW_MS = 15 * 60 * 1000

function checkIpRate(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS })
    return true
  }

  if (entry.count >= IP_MAX_ATTEMPTS) return false
  entry.count++
  return true
}

/**
 * POST /api/auth/session
 *
 * Accepts a Supabase access token (Authorization: Bearer <token>),
 * verifies it, looks up the user, creates an fp_session cookie,
 * and returns the user's primary footprint slug.
 */
export async function POST(request: NextRequest) {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 })
  }

  try {
    // IP rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkIpRate(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    // Extract Supabase access token from Authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })
    }
    const accessToken = authHeader.slice(7)

    // Verify the token with Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(accessToken)

    if (authError || !authUser?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Look up user in our users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', authUser.email)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Find user's primary footprint slug
    const { data: primaryFp } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    const sessionToken = await createSessionToken(user.id, user.email)

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
  } catch (err: any) {
    log.error({ err }, 'Session creation failed')
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 })
  }
}
