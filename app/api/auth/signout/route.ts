import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth'

/**
 * POST /api/auth/signout
 *
 * Clears the fp_session cookie -> user is logged out.
 * Must set same domain as login routes or cookie won't actually clear.
 */
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true })
  const hostname = new URL(request.url).hostname
  const cookieDomain = hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
    ? '.footprint.onl'
    : undefined

  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    ...(cookieDomain && { domain: cookieDomain }),
  })

  return res
}
