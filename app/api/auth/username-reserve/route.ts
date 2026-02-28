import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { usernameReserveSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'

// Reserved words that cannot be used as usernames
const RESERVED_WORDS = [
  'admin', 'footprint', 'api', 'www', 'auth', 'build', 'checkout',
  'signup', 'signin', 'login', 'publish', 'success', 'docs', 'welcome',
  'settings', 'home', 'about', 'help', 'support', 'aro', 'example',
  'deed', 'remix', 'dashboard', 'public', 'static', 'assets',
]

// In-memory rate limiter: 10 reservations per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

/**
 * POST /api/auth/username-reserve
 *
 * Checks username availability against the footprints table and returns
 * a reservation_token (the username itself) for the signup flow.
 *
 * The actual claim happens in /api/auth/magic-link when the user
 * completes email verification — it re-checks availability before
 * inserting. The footprints.username UNIQUE constraint is the
 * authoritative guard against races.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(usernameReserveSchema, body)
    if (!v.success) return v.response
    const { username } = v.data

    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`ip:${ip}`)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    // Check reserved words
    if (RESERVED_WORDS.includes(username)) {
      return NextResponse.json(
        { error: 'That username is not available.' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Check if username is already claimed in footprints
    const { data: existingFootprint } = await supabase
      .from('footprints')
      .select('id')
      .eq('username', username)
      .single()

    if (existingFootprint) {
      return NextResponse.json(
        { error: 'That username is not available.' },
        { status: 400 }
      )
    }

    // Username is available — return it as the reservation token.
    // The magic-link route re-checks availability + the UNIQUE constraint
    // on footprints.username prevents races.
    return NextResponse.json({
      reservation_token: username,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
  } catch (error) {
    console.error('Username reservation failed:', error)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
