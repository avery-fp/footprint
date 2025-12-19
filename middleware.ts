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
 * 
 * Protected routes are under /edit/* and /dashboard/*
 * These require a valid session cookie.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Public routes - no auth needed
  const publicRoutes = [
    '/',
    '/checkout',
    '/success',
    '/auth',
    '/auth/verify',
    '/auth/login',
    '/api/checkout',
    '/api/webhook',
    '/api/parse',
  ]
  
  // Check if this is a public route
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith('/api/')
  )
  
  // Check if this is a public footprint page (dynamic route)
  const isPublicFootprint = /^\/[a-zA-Z0-9-]+$/.test(pathname) && 
    !pathname.startsWith('/edit') && 
    !pathname.startsWith('/dashboard') &&
    !pathname.startsWith('/auth')
  
  // If public route or public footprint, allow through
  if (isPublicRoute || isPublicFootprint) {
    return NextResponse.next()
  }
  
  // Protected routes - check for session
  const sessionToken = request.cookies.get('session')?.value
  
  if (!sessionToken) {
    // No session - redirect to login
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
  
  // Valid session - add user info to headers for API routes
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', session.userId)
  requestHeaders.set('x-user-email', session.email)
  
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
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
