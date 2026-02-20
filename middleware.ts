import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from './lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.endsWith('/opengraph-image')) {
    return NextResponse.next()
  }

  // Fully public — no auth
  const publicRoutes = [
    '/',
    '/checkout',
    '/success',
    '/auth',
    '/auth/verify',
    '/auth/login',
    '/auth/callback',
    '/welcome',
    '/docs',
    '/api/checkout',
    '/api/webhook',
    '/api/create-user',
    '/api/parse',
    '/api/import-draft',
    '/api/og',
    '/api/qr',
    '/api/embed',
 claude/footprint-monetization-engine-ZDvAw
    '/api/v1',
    '/api/events',
    '/api/aro-feed',
    '/api/share',
    '/api/pulse',
    '/api/embed',
    '/api/metadata',
    '/deed',

    '/api/v1/footprint',
    '/api/analytics',
    '/api/next-serial',
 main
  ]

  const isPublic = publicRoutes.some(r =>
    pathname === r || pathname.startsWith(r + '/')
  )

  // Public footprint pages (e.g. /ae, /username) — single segment only
  const isPublicFootprint = /^\/[a-zA-Z0-9_-]+$/.test(pathname) &&
    !pathname.startsWith('/dashboard') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/api')

  if (isPublic || isPublicFootprint) {
    return NextResponse.next()
  }

  const sessionToken = request.cookies.get('session')?.value

  // Helper: build a safe login redirect URL (prevent open redirects)
  function loginRedirect(returnPath: string) {
    // Only allow relative paths starting with /
    const safe = returnPath.startsWith('/') && !returnPath.startsWith('//') ? returnPath : '/dashboard'
    return new URL(`/auth/login?redirect=${encodeURIComponent(safe)}`, request.url)
  }

  // ── /[slug]/home — REQUIRE auth (edit page) ──
  // Use regex for exact match: /something/home (case-insensitive, no trailing segments)
  const isEditPage = /^\/[a-zA-Z0-9_-]+\/home$/i.test(pathname)

  if (isEditPage && !pathname.startsWith('/api')) {
    if (!sessionToken) {
      return NextResponse.redirect(loginRedirect(pathname))
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      const res = NextResponse.redirect(loginRedirect(pathname))
      res.cookies.delete('session')
      return res
    }

    const headers = new Headers(request.headers)
    headers.set('x-user-id', session.userId)
    headers.set('x-user-email', session.email)
    return NextResponse.next({ request: { headers } })
  }

  // ── API routes — pass auth headers if present ──
  if (pathname.startsWith('/api/')) {
    if (!sessionToken) return NextResponse.next()

    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.next()

    const headers = new Headers(request.headers)
    headers.set('x-user-id', session.userId)
    headers.set('x-user-email', session.email)
    return NextResponse.next({ request: { headers } })
  }

 claude/footprint-monetization-engine-ZDvAw
  // Page routes: redirect to checkout/login if no session
  if (!sessionToken) {
    if (pathname === '/build') {
      return NextResponse.redirect(new URL('/checkout', request.url))
    }
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)

  // ── All other pages — require auth ──
  if (!sessionToken) {
    return NextResponse.redirect(loginRedirect(pathname))
 main
  }

  const session = await verifySessionToken(sessionToken)
  if (!session) {
    const res = NextResponse.redirect(loginRedirect(pathname))
    res.cookies.delete('session')
    return res
  }

  const headers = new Headers(request.headers)
  headers.set('x-user-id', session.userId)
  headers.set('x-user-email', session.email)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
}
