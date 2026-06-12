import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/auth'
import { CODE_TTL_MS, generateCode, hashCode } from '@/lib/edit-access-codes'
import { sendGiftClaimCodeEmail } from '@/lib/gifts'

const attempts = new Map<string, { count: number; resetAt: number }>()
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_START_ATTEMPTS = 10
const MAX_CODES_PER_WINDOW = 3

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_START_ATTEMPTS
}

function giftCodeSlug(giftId: string): string {
  return `gift:${giftId}`
}

function validUsername(username: unknown): username is string {
  return typeof username === 'string'
    && username.length >= 3
    && username.length <= 20
    && (/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/).test(username)
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

  const { token, username } = body

  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 64) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  if (!validUsername(username)) {
    return NextResponse.json({ error: 'Username: lowercase letters, numbers, hyphens only' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: gift } = await supabase
    .from('gifts')
    .select('id, recipient_email, claimed')
    .eq('claim_token', token)
    .maybeSingle()

  if (!gift || gift.claimed) {
    return NextResponse.json({ error: 'Invalid or expired gift link' }, { status: 404 })
  }

  const { data: existingFp } = await supabase
    .from('footprints')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (existingFp) {
    return NextResponse.json({ error: 'Username taken' }, { status: 400 })
  }

  const email = normalizeEmail(gift.recipient_email)
  const slug = giftCodeSlug(gift.id)
  const sinceIso = new Date(Date.now() - CODE_TTL_MS).toISOString()

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (existingUser) {
    return NextResponse.json({ error: 'This email already owns a Footprint.' }, { status: 400 })
  }

  const { count } = await supabase
    .from('edit_access_codes')
    .select('id', { count: 'exact', head: true })
    .eq('slug', slug)
    .eq('email', email)
    .gte('created_at', sinceIso)

  if ((count || 0) >= MAX_CODES_PER_WINDOW) {
    return NextResponse.json({ success: true })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  const { error: insertError } = await supabase.from('edit_access_codes').insert({
    slug,
    email,
    code_hash: hashCode(code),
    expires_at: expiresAt,
  })

  if (insertError) {
    console.error('Gift claim code insert failed:', insertError)
    return NextResponse.json({ error: 'Could not send code' }, { status: 500 })
  }

  try {
    await sendGiftClaimCodeEmail(email, code)
  } catch (error) {
    console.error('Gift claim code email failed:', error)
    return NextResponse.json({ error: 'Could not send code' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
