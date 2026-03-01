import { NextRequest, NextResponse } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '@/lib/auth'
import * as bcrypt from 'bcryptjs'
import { loginSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/auth/login')

// Brute-force protection: 5 failed attempts per email → locked 15 min
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

// IP rate limit: 20 attempts per 15 min
const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const IP_MAX_ATTEMPTS = 20
const IP_WINDOW_MS = 15 * 60 * 1000

function checkEmailBruteForce(email: string): boolean {
  const key = email.toLowerCase().trim()
  const now = Date.now()
  const entry = failedAttempts.get(key)

  if (!entry) return true

  if (entry.lockedUntil && now > entry.lockedUntil) {
    failedAttempts.delete(key)
    return true
  }

  if (entry.lockedUntil && now <= entry.lockedUntil) return false

  return true
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

export async function POST(request: NextRequest) {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const v = validateBody(loginSchema, body)
    if (!v.success) return v.response
    const { email, password } = v.data

    // IP rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkIpRate(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    // Per-email brute force check
    if (!checkEmailBruteForce(email)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (error || !user || !user.password_hash) {
      recordFailedAttempt(email)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      recordFailedAttempt(email)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Success — clear failed attempts
    clearFailedAttempts(email)

    const sessionToken = await createSessionToken(user.id, user.email)

    // Find user's primary footprint slug for direct redirect to editor
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
  } catch (err: any) {
    log.error({ err }, 'Login failed')
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '@/lib/auth'
import { loginSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/auth/login')

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
 * POST /api/auth/login
 *
 * Accepts { email, password } in body.
 * Authenticates via Supabase Auth server-side, then creates
 * an fp_session JWT cookie and returns the user's slug.
 */
export async function POST(request: NextRequest) {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const v = validateBody(loginSchema, body)
    if (!v.success) return v.response
    const { email, password } = v.data

    // IP rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkIpRate(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    // Authenticate with Supabase Auth using the anon key (not service role)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Use service role client to look up user in our custom users table
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', email)
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
    log.error({ err }, 'Login failed')
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
