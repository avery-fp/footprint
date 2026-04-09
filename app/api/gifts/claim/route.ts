import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken, getSessionCookieOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'

// Rate limiting: max 10 claim attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>()
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_ATTEMPTS
}

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, username, password } = body

  // Validate token format — must be base64url, 43 chars (32 bytes encoded)
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 64) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 })
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(username)) {
    return NextResponse.json({ error: 'Username: lowercase letters, numbers, hyphens only' }, { status: 400 })
  }

  if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return NextResponse.json({ error: 'Password must be 6-128 characters' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Find the gift — use constant-time-safe approach (DB lookup, not string comparison)
  const { data: gift } = await supabase
    .from('gifts')
    .select('*')
    .eq('claim_token', token)
    .single()

  if (!gift) {
    // Generic message to avoid token enumeration
    return NextResponse.json({ error: 'Invalid or expired gift link' }, { status: 404 })
  }

  if (gift.claimed) {
    return NextResponse.json({ error: 'This gift has already been claimed' }, { status: 400 })
  }

  // Check username availability
  const { data: existingFp } = await supabase
    .from('footprints')
    .select('id')
    .eq('username', username)
    .single()

  if (existingFp) {
    return NextResponse.json({ error: 'Username taken' }, { status: 400 })
  }

  // Claim serial number
  const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
  if (serialError || !serialData) {
    return NextResponse.json({ error: 'Failed to claim serial' }, { status: 500 })
  }

  const serialNumber = serialData

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10)

  // Create user
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      email: gift.recipient_email,
      serial_number: serialNumber,
      password_hash: passwordHash,
      gifts_remaining: 2,
    })
    .select()
    .single()

  if (userError || !user) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', gift.recipient_email)
      .single()

    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists. Log in instead.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  // Create footprint
  await supabase.from('footprints').insert({
    user_id: user.id,
    username,
    serial_number: serialNumber,
    name: 'Everything',
    icon: '◈',
    is_primary: true,
    published: true,
  })

  // Mark gift as claimed atomically — only update if still unclaimed (prevents race)
  const { data: claimResult } = await supabase
    .from('gifts')
    .update({
      claimed: true,
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', gift.id)
    .eq('claimed', false)
    .select('id')

  if (!claimResult || claimResult.length === 0) {
    // Race condition: someone else claimed between our check and update
    return NextResponse.json({ error: 'This gift was just claimed by someone else' }, { status: 409 })
  }

  // Create session
  const sessionToken = await createSessionToken(user.id, user.email)

  const response = NextResponse.json({
    success: true,
    serial_number: serialNumber,
    username,
  })

  response.cookies.set(
    'fp_session',
    sessionToken,
    getSessionCookieOptions(new URL(request.url).hostname)
  )

  return response
}
