import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth'

/**
 * POST /api/auth/signout
 *
 * Clears the fp_session cookie -> user is logged out.
 * Must set same domain as login routes or cookie won't actually clear.
 */
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(new URL(request.url).hostname),
    maxAge: 0,
  })

  return res
}
