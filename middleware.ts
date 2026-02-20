import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

  const headers = new Headers(request.headers)
  headers.set('x-user-id', session.value)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
}
