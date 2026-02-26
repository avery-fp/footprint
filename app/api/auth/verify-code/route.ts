import { NextRequest, NextResponse } from 'next/server'
import { verifyOTP } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

// Brute-force protection: 5 failed attempts per email → locked 15 min
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

// IP rate limit: 20 attempts per 15 min (covers distributed attacks across emails)
const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const IP_MAX_ATTEMPTS = 20
const IP_WINDOW_MS = 15 * 60 * 1000

function checkEmailBruteForce(email: string): { allowed: boolean; remaining: number } {
  const key = email.toLowerCase().trim()
  const now = Date.now()
  const entry = failedAttempts.get(key)

  if (!entry) return { allowed: true, remaining: MAX_ATTEMPTS }

  // Lockout expired — reset
  if (entry.lockedUntil && now > entry.lockedUntil) {
    failedAttempts.delete(key)
    return { allowed: true, remaining: MAX_ATTEMPTS }
  }

  // Currently locked out
  if (entry.lockedUntil && now <= entry.lockedUntil) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count }
}

function recordFailedAttempt(email: string) {
  const key = email.toLowerCase().trim()
  const entry = failedAttempts.get(key) || { count: 0, lockedUntil: 0 }
  entry.count++

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS
  }

  failedAttempts.set(key, entry)
}

function clearFailedAttempts(email: string) {
  failedAttempts.delete(email.toLowerCase().trim())
}

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
 * POST /api/auth/verify-code
 *
 * Verifies a 6-digit OTP code + email → creates session.
 * Body: { email, code }
 *
 * Brute-force protection:
 * - 5 failed attempts per email → locked for 15 minutes
 * - 20 attempts per IP per 15 minutes
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

    // IP rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkIpRate(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    // Per-email brute force check
    const bf = checkEmailBruteForce(email)
    if (!bf.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })
    }

    const result = await verifyOTP(email, code)

    if (!result) {
      recordFailedAttempt(email)
      const after = checkEmailBruteForce(email)
      if (after.remaining <= 0) {
        return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
    }

    // Success — clear failed attempts
    clearFailedAttempts(email)

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
