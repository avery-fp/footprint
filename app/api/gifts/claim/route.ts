import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { editCookieName, EDIT_COOKIE_OPTIONS } from '@/lib/edit-auth'
import { normalizeEmail } from '@/lib/auth'

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

  if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20) {
    return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 })
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(username)) {
    return NextResponse.json({ error: 'Username: lowercase letters, numbers, hyphens only' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: gift } = await supabase
    .from('gifts')
    .select('*')
    .eq('claim_token', token)
    .single()

  if (!gift) {
    return NextResponse.json({ error: 'Invalid or expired gift link' }, { status: 404 })
  }

  if (gift.claimed) {
    return NextResponse.json({ error: 'This gift has already been claimed' }, { status: 400 })
  }

  const { data: existingFp } = await supabase
    .from('footprints')
    .select('id')
    .eq('username', username)
    .single()

  if (existingFp) {
    return NextResponse.json({ error: 'Username taken' }, { status: 400 })
  }

  const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
  if (serialError || !serialData) {
    return NextResponse.json({ error: 'Failed to claim serial' }, { status: 500 })
  }

  const serialNumber = serialData
  const editToken = crypto.randomUUID()
  const email = normalizeEmail(gift.recipient_email)

  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({ email, serial_number: serialNumber, gifts_remaining: 2 })
    .select()
    .single()

  if (userError || !user) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  await supabase.from('footprints').insert({
    user_id: user.id,
    username,
    serial_number: serialNumber,
    edit_token: editToken,
    name: 'Everything',
    icon: '◈',
    is_primary: true,
    published: true,
  })

  // Atomic claim — only update if still unclaimed (prevents race)
  const { data: claimResult } = await supabase
    .from('gifts')
    .update({ claimed: true, claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', gift.id)
    .eq('claimed', false)
    .select('id')

  if (!claimResult || claimResult.length === 0) {
    return NextResponse.json({ error: 'This gift was just claimed by someone else' }, { status: 409 })
  }

  const response = NextResponse.json({ success: true, serial_number: serialNumber, username, edit_token: editToken })
  response.cookies.set(editCookieName(username), editToken, EDIT_COOKIE_OPTIONS)
  return response
}
