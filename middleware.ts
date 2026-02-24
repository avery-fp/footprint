import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware: canonical host redirect + session gate.
 *
 * Rules:
 * 1. Redirect bare "footprint.onl" → "www.footprint.onl" (301)
 * 2. Public routes → pass through
 * 3. Auth-required routes → check fp_session cookie exists
 *    - present  → allow through
 *    - missing  → redirect to /auth/login
 *
 * Middleware does NOT verify/decode the JWT. API routes handle that.
 */

const publicRoutes = [
  '/',
  '/auth',
  '/auth/login',
  '/auth/callback',
  '/signup',
  '/signin',
  '/checkout',
  '/success',
  '/deed',
  '/api/',
  '/public',
]

/**
 * Add security headers to all responses.
 */
function withSecurityHeaders(response: ReturnType<typeof NextResponse.next>) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  return response
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get('host') || ''

  // ── 1. Canonical host: redirect apex → www ──
  if (host === 'footprint.onl') {
    const canonical = new URL(`https://www.footprint.onl${pathname}${search}`)
    return NextResponse.redirect(canonical, 301)
  }

  // ── 2. Public routes ──
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return withSecurityHeaders(NextResponse.next())
  }

  // All /api routes are public (handled by their own auth)
  if (pathname.startsWith('/api/') || pathname.startsWith('/api')) {
    return withSecurityHeaders(NextResponse.next())
  }

  // Public profile pages: /{slug} (single segment, no sub-path)
  const isPublicProfile = /^\/[a-zA-Z0-9_-]+$/.test(pathname)
  if (isPublicProfile) {
    return withSecurityHeaders(NextResponse.next())
  }

  // ── 3. Auth-required routes ──
  // Everything below here requires a session cookie.
  // /{slug}/home and any other sub-paths are auth-required.
  const session = request.cookies.get('fp_session')

  if (session?.value) {
    // Cookie exists → let them through. API routes validate the JWT.
    return withSecurityHeaders(NextResponse.next())
  }

  // No session → redirect to signin
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/signin'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
