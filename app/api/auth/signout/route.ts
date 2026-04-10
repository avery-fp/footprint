import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth'
import { createRouteHandlerSupabaseAuthClient } from '@/lib/supabase-auth-ssr'

/**
 * POST /api/auth/signout
 *
 * Clears BOTH auth states:
 * 1. fp_session (our JWT cookie)
 * 2. Supabase SSR auth cookies (so getUserIdentityFromRequest fallback
 *    doesn't silently re-recognize the user)
 */
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true })
  const hostname = new URL(request.url).hostname
  const cookieDomain = hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
    ? '.footprint.onl'
    : undefined

  // 1. Clear our JWT session cookie
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    ...(cookieDomain && { domain: cookieDomain }),
  })

  // 2. Clear Supabase SSR auth cookies
  const { supabase, applyPendingCookies } = createRouteHandlerSupabaseAuthClient(request)
  await supabase.auth.signOut()

  return applyPendingCookies(res)
}
