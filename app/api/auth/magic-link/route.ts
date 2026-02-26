import { NextRequest, NextResponse } from 'next/server'
import { generateOTP, sendOTPEmail } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { magicLinkSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/auth/magic-link')

// In-memory rate limiters
const emailRateLimitMap = new Map<string, { count: number; resetAt: number }>()
const ipRateLimitMap = new Map<string, { count: number; resetAt: number }>()
const cooldownMap = new Map<string, number>()

const EMAIL_RATE_LIMIT_MAX = 5
const EMAIL_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const IP_RATE_LIMIT_MAX = 10
const IP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const COOLDOWN_MS = 60 * 1000 // 60 seconds between sends to same email

function checkRateLimit(map: Map<string, { count: number; resetAt: number }>, key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = map.get(key)
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

function checkCooldown(email: string): boolean {
  const now = Date.now()
  const lastSent = cooldownMap.get(email)
  if (lastSent && now - lastSent < COOLDOWN_MS) return false
  return true
}

/**
 * POST /api/auth/magic-link
 *
 * Unified auth: handles both new and returning users.
 * Sends a 6-digit OTP code instead of a magic link.
 *
 * - If email exists → send code
 * - If email is new + valid reservation_token → create user, send code
 * - If email is new + no reservation → silent success (no info leaked)
 *
 * Response is ALWAYS { ok: true } — never reveals whether email exists.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(magicLinkSchema, body)
    if (!v.success) return v.response
    const { email, reservation_token } = v.data

    // Rate limits — always return ok: true to not leak info
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    if (!checkRateLimit(emailRateLimitMap, email, EMAIL_RATE_LIMIT_MAX, EMAIL_RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json({ ok: true })
    }

    if (!checkRateLimit(ipRateLimitMap, ip, IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json({ ok: true })
    }

    if (!checkCooldown(email)) {
      return NextResponse.json({ ok: true })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user exists — case-insensitive
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', email)
      .single()

    if (existingUser) {
      // ── Returning user: send OTP code ──
      const code = await generateOTP(existingUser.email)
      await sendOTPEmail(existingUser.email, code)
      cooldownMap.set(email, Date.now())
      return NextResponse.json({ ok: true })
    }

    // ── New user: need a valid reservation ──
    if (!reservation_token) {
      return NextResponse.json({ ok: true })
    }

    // Validate reservation token
    const { data: reservation } = await supabase
      .from('username_reservations')
      .select('username, token, expires_at')
      .eq('token', reservation_token)
      .single()

    if (!reservation || new Date(reservation.expires_at) < new Date()) {
      return NextResponse.json({ ok: true })
    }

    // Check the username isn't already taken
    const { data: existingFp } = await supabase
      .from('footprints')
      .select('id')
      .eq('username', reservation.username)
      .single()

    if (existingFp) {
      return NextResponse.json({ ok: true })
    }

    // Create user (no password, no serial number — unpublished)
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({ email })
      .select('id, email')
      .single()

    if (userError || !newUser) {
      log.error({ err: userError }, 'User creation failed during signup')
      return NextResponse.json({ ok: true })
    }

    // Create unpublished footprint with reserved username
    const { error: fpError } = await supabase.from('footprints').insert({
      user_id: newUser.id,
      username: reservation.username,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      published: false,
    })

    if (fpError) {
      log.error({ err: fpError }, 'Footprint creation failed during signup')
    }

    // Delete reservation
    await supabase
      .from('username_reservations')
      .delete()
      .eq('token', reservation_token)

    // Send OTP to new user
    const code = await generateOTP(email)
    await sendOTPEmail(email, code)
    cooldownMap.set(email, Date.now())

    return NextResponse.json({ ok: true })

  } catch (error) {
    log.error({ err: error }, 'Auth code send failed')
    return NextResponse.json({ ok: true })
  }
}
