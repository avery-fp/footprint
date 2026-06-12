import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { editCookieName, EDIT_COOKIE_OPTIONS } from '@/lib/edit-auth'
import { normalizeEmail } from '@/lib/auth'
import { CODE_LENGTH, MAX_ATTEMPTS as MAX_CODE_ATTEMPTS, hashCode, timingSafeEqualHex } from '@/lib/edit-access-codes'

const attempts = new Map<string, { count: number; resetAt: number }>()
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

function giftCodeSlug(giftId: string): string {
  return `gift:${giftId}`
}

function validUsername(username: unknown): username is string {
  return typeof username === 'string'
    && username.length >= 3
    && username.length <= 20
    && (/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/).test(username)
}

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

  const { token, username, code } = body

  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 64) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  if (!validUsername(username)) {
    return NextResponse.json({ error: 'Username: lowercase letters, numbers, hyphens only' }, { status: 400 })
  }

  if (!code || typeof code !== 'string' || !new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: gift } = await supabase
    .from('gifts')
    .select('id, recipient_email, claimed')
    .eq('claim_token', token)
    .maybeSingle()

  if (!gift) {
    return NextResponse.json({ error: 'Invalid or expired gift link' }, { status: 404 })
  }

  if (gift.claimed) {
    return NextResponse.json({ error: 'This gift has already been claimed' }, { status: 400 })
  }

  const email = normalizeEmail(gift.recipient_email)
  const codeSlug = giftCodeSlug(gift.id)
  const nowIso = new Date().toISOString()

  const { data: codeRow } = await supabase
    .from('edit_access_codes')
    .select('id, code_hash, attempts')
    .eq('slug', codeSlug)
    .eq('email', email)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .lt('attempts', MAX_CODE_ATTEMPTS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!codeRow) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
  }

  const codeMatches = timingSafeEqualHex(codeRow.code_hash, hashCode(code))
  if (!codeMatches) {
    await supabase
      .from('edit_access_codes')
      .update({ attempts: (codeRow.attempts || 0) + 1 })
      .eq('id', codeRow.id)

    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
  }

  const editToken = crypto.randomUUID()
  const { data: claimResult, error: claimError } = await supabase
    .rpc('claim_gift_with_verified_email', {
      p_gift_id: gift.id,
      p_email: email,
      p_username: username,
      p_edit_token: editToken,
    })

  if (claimError || !claimResult || claimResult.length === 0) {
    const message = claimError?.message || ''
    if (message.includes('username_taken')) {
      return NextResponse.json({ error: 'Username taken' }, { status: 400 })
    }
    if (message.includes('email_already_owns_footprint')) {
      return NextResponse.json({ error: 'This email already owns a Footprint.' }, { status: 400 })
    }
    if (message.includes('gift_already_claimed')) {
      return NextResponse.json({ error: 'This gift has already been claimed' }, { status: 409 })
    }
    console.error('Gift claim RPC failed:', claimError)
    return NextResponse.json({ error: 'Failed to claim gift' }, { status: 500 })
  }

  const claimed = claimResult[0]

  await supabase
    .from('edit_access_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', codeRow.id)

  const response = NextResponse.json({
    success: true,
    serial_number: claimed.claimed_serial_number,
    username: claimed.claimed_username,
    edit_token: claimed.claimed_edit_token,
  })
  response.cookies.set(editCookieName(claimed.claimed_username), claimed.claimed_edit_token, EDIT_COOKIE_OPTIONS)
  return response
}
