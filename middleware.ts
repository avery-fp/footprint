import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set')
  }
  return new TextEncoder().encode(secret || 'dev-only-unsafe-key-do-not-use-in-prod')
}

const publicRoutes = [
  '/',
  '/auth',
  '/auth/login',
  '/auth/callback',
  '/checkout',
  '/success',
  '/deed',
  '/api/auth',
  '/api/checkout',
  '/api/checkout/free',
  '/api/checkout/activate',
  '/api/webhook',
  '/api/og',
  '/api/qr',
  '/api/embed',
  '/api/v1',
  '/api/events',
  '/api/aro-feed',
  '/api/share',
  '/api/pulse',
  '/api/health',
  '/api/metadata',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic = publicRoutes.some(route => pathname.startsWith(route))
  if (isPublic) {
    return NextResponse.next()
  }

  const isPublicProfile = /^\/[a-zA-Z0-9_-]+$/.test(pathname)
  if (isPublicProfile) {
    return NextResponse.next()
  }

  const session = request.cookies.get('fp_session')
  if (!session?.value) {
    const url = request.nextUrl.clone()
    url.pathname = '/checkout'
    return NextResponse.redirect(url)
  }

  // Decode the JWT to extract the actual user ID
  try {
    const { payload } = await jwtVerify(session.value, getJwtSecret())
    const headers = new Headers(request.headers)
    headers.set('x-user-id', payload.userId as string)
    return NextResponse.next({ request: { headers } })
  } catch {
    // Invalid or expired token — clear it and redirect to login
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const response = NextResponse.redirect(url)
    response.cookies.delete('fp_session')
    return response
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
}
