import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { usernameReserveSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/auth/username-reserve')

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
 * Temporarily reserves a username during the signup flow.
 * Reservation expires after 15 minutes.
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

    // Upsert reservation — only overwrite if the existing one is expired
    const { data, error } = await supabase.rpc('reserve_username', {
      p_username: username,
    })

    if (error) {
      // If the RPC doesn't exist yet, fall back to direct insert
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('username_reservations')
        .upsert(
          {
            username,
            token: crypto.randomUUID(),
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
          { onConflict: 'username' }
        )
        .select('token, expires_at')
        .single()

      if (fallbackError) {
        log.error({ err: fallbackError }, 'Username reservation failed')
        return NextResponse.json(
          { error: 'Could not reserve username.' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        reservation_token: fallbackData.token,
        expires_at: fallbackData.expires_at,
      })
    }

    return NextResponse.json({
      reservation_token: data?.token || data,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
  } catch (error) {
    log.error({ err: error }, 'Username reservation failed')
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
