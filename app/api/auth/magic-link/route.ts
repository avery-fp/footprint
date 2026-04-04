import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/auth/magic-link
 *
 * Sends a magic link email via Supabase Auth.
 * Works for both existing users (login) and new users (will create on callback).
 */

// Rate limit: 3 magic links per email per 15 minutes
const emailRateLimit = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 3
const RATE_WINDOW_MS = 15 * 60 * 1000

function checkRate(email: string): boolean {
  const key = email.toLowerCase().trim()
  const now = Date.now()
  const entry = emailRateLimit.get(key)

  if (!entry || now > entry.resetAt) {
    emailRateLimit.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const cleanEmail = email.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Rate limit
    if (!checkRate(cleanEmail)) {
      return NextResponse.json({ error: 'Too many requests. Try again in 15 minutes.' }, { status: 429 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Magic links not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback`,
        shouldCreateUser: true,
      },
    })

    if (error) {
      console.error('[magic-link] Supabase OTP error:', error)
      return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
    }

    // Also store in our magic_links table for tracking
    const dbSupabase = createServerSupabaseClient()
    const token = nanoid(32)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    await dbSupabase.from('magic_links').insert({
      email: cleanEmail,
      token,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      ip_address: ip,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[magic-link] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
