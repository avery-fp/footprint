import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

/**
 * Middleware: canonical host redirect + session gate.
 *
 * Rules:
 * 1. Redirect bare "footprint.onl" → "www.footprint.onl" (301)
 * 2. Public routes → pass through
 * 3. Auth-required routes → verify fp_session JWT signature
 *    - valid    → allow through
 *    - invalid  → clear cookie + redirect to /auth/login
 */

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set')
  }
  return new TextEncoder().encode(secret || 'dev-only-unsafe-key-do-not-use-in-prod')
}

let _jwtSecret: Uint8Array | null = null
function jwtSecret() {
  if (!_jwtSecret) _jwtSecret = getJwtSecret()
  return _jwtSecret
}

const publicRoutes = [
  '/',
  '/auth',
  '/auth/login',
  '/auth/callback',
  '/checkout',
  '/success',
  '/deed',
  '/api/',
  '/public',
]

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get('host') || ''

  // ── 1. Canonical host: redirect apex → www ──
  if (host === 'footprint.onl') {
    const canonical = new URL(`https://www.footprint.onl${pathname}${search}`)
    return NextResponse.redirect(canonical, 301)
  }

  // ── 2. Public routes ──
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next()
  }

  // All /api routes are public (handled by their own auth)
  if (pathname.startsWith('/api/') || pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // Public profile pages: /{slug} (single segment, no sub-path)
  const isPublicProfile = /^\/[a-zA-Z0-9_-]+$/.test(pathname)
  if (isPublicProfile) {
    return NextResponse.next()
  }

  // ── 3. Auth-required routes ──
  // Everything below here requires a valid JWT session.
  // /{slug}/home and any other sub-paths are auth-required.
  const sessionCookie = request.cookies.get('fp_session')

  if (sessionCookie?.value) {
    try {
      await jwtVerify(sessionCookie.value, jwtSecret())
      return NextResponse.next()
    } catch {
      // Invalid/expired JWT — clear the stale cookie and redirect
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth/login'
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete('fp_session')
      return response
    }
  }

  // No session → redirect to login
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/auth/login'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
