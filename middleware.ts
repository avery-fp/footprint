import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from './lib/auth'

/**
 * Next.js Middleware
 *
 * Runs before every request. Handles:
 * 1. Protected route authentication
 * 2. Redirects for unauthenticated users
 * 3. Session validation
 * 4. Setting x-user-id header for API routes
 *
 * Protected routes are under /edit/* and /dashboard/*
 * These require a valid session cookie.
 *
 * API routes get x-user-id header if authenticated,
 * but don't redirect (they return 401 themselves).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Fully public routes - no auth check at all
  const fullyPublicRoutes = [
    '/',
    '/checkout',
    '/success',
    '/auth',
    '/auth/verify',
    '/auth/login',
    '/edit',
    '/api/checkout',
    '/api/webhook',
    '/api/parse',
    '/api/import-draft',
    '/api/og',
    '/api/qr',
    '/api/embed',
    '/api/v1',
  ]

  // Check if this is a fully public route
  const isFullyPublic = fullyPublicRoutes.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  // Check if this is a public footprint page (dynamic route like /ae, /username)
  const isPublicFootprint = /^\/[a-zA-Z0-9-]+$/.test(pathname) &&
    !pathname.startsWith('/edit') &&
    !pathname.startsWith('/dashboard') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/api')

  // Fully public routes pass through without any processing
  if (isFullyPublic || isPublicFootprint) {
    return NextResponse.next()
  }

  // Check for session
  const sessionToken = request.cookies.get('session')?.value

  // API routes: set headers if authenticated, pass through if not (let API handle 401)
  if (pathname.startsWith('/api/')) {
    if (!sessionToken) {
      return NextResponse.next()
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      return NextResponse.next()
    }

    // Set user headers for authenticated API calls
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', session.userId)
    requestHeaders.set('x-user-email', session.email)

    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  // Page routes: redirect to login if no session
  if (!sessionToken) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify the session token
  const session = await verifySessionToken(sessionToken)

  if (!session) {
    // Invalid session - clear cookie and redirect
    const response = NextResponse.redirect(new URL('/auth/login', request.url))
    response.cookies.delete('session')
    return response
  }

  // Valid session - add user info to headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', session.userId)
  requestHeaders.set('x-user-email', session.email)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
}
