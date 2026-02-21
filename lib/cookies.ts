import type { NextResponse } from 'next/server'

/**
 * Derive the cookie domain from the request hostname.
 * Returns '.footprint.onl' for production, undefined for localhost/other.
 */
export function getCookieDomain(hostname: string): string | undefined {
  if (hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl') {
    return '.footprint.onl'
  }
  return undefined
}

/**
 * Set the fp_session cookie on a response with consistent options.
 */
export function setSessionCookie(
  response: NextResponse,
  sessionToken: string,
  hostname: string,
) {
  const cookieDomain = getCookieDomain(hostname)

  response.cookies.set('fp_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    ...(cookieDomain && { domain: cookieDomain }),
  })
}
