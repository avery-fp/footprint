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
 *    - missing  → redirect to /ae?claim=1 (the canonical auth entry)
 *
 * Middleware does NOT verify/decode the JWT. API routes handle that.
 */

// Only multi-segment routes need explicit entries here. Single-segment
// public routes (/login, /signup, /signin, /welcome, /claim, /build, etc.)
// are caught by the isPublicProfile regex below. /api/ is caught by
// isApiRoute. /auth covers both /auth/login and /auth/callback via prefix.
const publicRoutes = [
  '/',
  '/auth',
  '/deed',
  '/gift',
  '/public',
]

/**
 * Add security headers to all responses.
 */
function withSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https: data:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://player.vimeo.com https://w.soundcloud.com https://bandcamp.com https://maps.google.com https://codepen.io https://www.are.na https://www.figma.com https://embed.music.apple.com",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '))
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
    return withSecurityHeaders(NextResponse.redirect(canonical, 301))
  }

  // ── 2. Homepage → ae's footprint ──
  if (pathname === '/') {
    const rewrite = request.nextUrl.clone()
    rewrite.pathname = '/ae'
    return withSecurityHeaders(NextResponse.rewrite(rewrite))
  }

  // ── 3. Public routes ──
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))
  const isApiRoute = pathname.startsWith('/api/') || pathname.startsWith('/api')
  const isPublicProfile = /^\/[a-zA-Z0-9_-]+$/.test(pathname)
  const isHomeEditor = /^\/[a-zA-Z0-9_-]+\/home$/.test(pathname)

  if (isPublicRoute || isApiRoute || isPublicProfile || isHomeEditor) {
    // ── SID attribution cookie: capture ?sid= on any public/profile route ──
    const sid = request.nextUrl.searchParams.get('sid')
    if (sid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
      const response = withSecurityHeaders(NextResponse.next())
      response.cookies.set('fp_sid', sid, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      })
      return response
    }
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

  // No session → redirect to /ae?claim=1 (the Sovereign Tile handles auth)
  const claimUrl = request.nextUrl.clone()
  claimUrl.pathname = '/ae'
  claimUrl.searchParams.set('claim', '1')
  return NextResponse.redirect(claimUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
