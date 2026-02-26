import { NextResponse } from 'next/server'

/**
 * POST /api/auth/signout
 *
 * Clears the fp_session cookie → user is logged out.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true })

  res.cookies.set('fp_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  return res
}
