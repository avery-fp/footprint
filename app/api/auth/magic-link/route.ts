import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createRouteHandlerSupabaseAuthClient } from '@/lib/supabase-auth-ssr'
import { sanitizeRedirect } from '@/lib/redirect'

/**
 * POST /api/auth/magic-link
 *
 * Sends a magic link email via Supabase Auth.
 * Works for both existing users (login) and new users (will create on callback).
 *
 * Must use the cookie-aware SSR client so the PKCE code_verifier is persisted
 * in a response cookie. Without this, Supabase generates a verifier server-
 * side but it never reaches the browser, and the callback's
 * exchangeCodeForSession always fails.
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
    const { email, redirect } = await request.json()

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

    const { supabase, applyPendingCookies } = createRouteHandlerSupabaseAuthClient(request)

    // Pin the callback to the canonical production origin. This must match
    // an entry in the Supabase dashboard's redirect URL allow-list exactly;
    // a derived baseUrl can silently drift and cause "redirect URL mismatch"
    // at the Supabase edge. Query params are still allowed — Supabase
    // matches the allow-list on origin + path, not full URL.
    //
    // Threading ?redirect= here lets the callback restore the claimer's
    // intended destination even when the magic link is opened in a
    // different browser than the one that requested it (Gmail → Safari),
    // where the post_auth_redirect cookie will be absent.
    const safeRedirect = sanitizeRedirect(redirect)
    const callbackUrl = new URL('https://www.footprint.onl/auth/callback')
    if (safeRedirect) {
      callbackUrl.searchParams.set('redirect', safeRedirect)
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: true,
      },
    })

    if (error) {
      console.error('[magic-link] Supabase OTP error:', error)
      return applyPendingCookies(NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 }))
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

    // applyPendingCookies is critical — it carries the PKCE code_verifier
    // cookie back to the browser so the subsequent /auth/callback can
    // exchange the code.
    return applyPendingCookies(NextResponse.json({ success: true }))
  } catch (err) {
    console.error('[magic-link] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
