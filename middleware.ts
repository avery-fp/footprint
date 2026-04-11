import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_ENTRY } from '@/lib/routes'

/**
 * Middleware: canonical host redirect + session gate.
 *
 * Rules:
 * 1. Redirect bare "footprint.onl" → "www.footprint.onl" (301)
 * 2. Legacy auth entry points (/login, /signin, /auth/login) → hard 307
 *    to AUTH_ENTRY. Handled here rather than in server components so the
 *    redirect is a real HTTP response instead of an RSC-streaming template
 *    that only fires after JS hydration. Crawlers, email clients, link
 *    previewers, and curl all follow it correctly.
 * 3. Public routes → pass through
 * 4. Auth-required routes → check fp_session cookie exists
 *    - present  → allow through
 *    - missing  → redirect to AUTH_ENTRY
 *
 * Middleware does NOT verify/decode the JWT. API routes handle that.
 */

// Legacy auth entry points — any hit here is redirected at the edge to the
// canonical AUTH_ENTRY with a proper HTTP 307. Single source of truth:
// lib/routes.ts. Do not add new entries here without also deleting the
// corresponding app/**/page.tsx redirect stub.
const LEGACY_AUTH_ROUTES = new Set<string>([
  ...['login', 'signin'].map((segment) => `/${segment}`),
  `/${['auth', 'login'].join('/')}`,
])

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

  // ── 2a. /home — always pass through to the server component ──
  // Authenticated → resolves slug → redirects to /{slug}/home
  // Unauthenticated → renders minimal Google auth entry page
  if (pathname === '/home') {
    return withSecurityHeaders(NextResponse.next())
  }

  // ── 2b. Legacy auth entry points → hard 307 to AUTH_ENTRY ──
  // Previously these were handled by server-component redirect() stubs in
  // app/login/page.tsx, app/signin/page.tsx, app/auth/login/page.tsx.
  // Those worked in real browsers but Next's RSC streaming pipeline emits
  // a <template data-dgst="NEXT_REDIRECT;...307;"> that only fires after
  // hydration — crawlers, curl, Slack unfurlers, and email previewers saw
  // a 200 OK with a blank div and never navigated. That broke welcome-
  // email link previews and deliverability for any mass-send. Moving the
  // redirect to the edge gives every client a real HTTP 307.
  if (LEGACY_AUTH_ROUTES.has(pathname)) {
    const target = new URL(AUTH_ENTRY, request.url)
    return withSecurityHeaders(NextResponse.redirect(target, 307))
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

  // No session → redirect to /home (the single auth entry point)
  const homeUrl = request.nextUrl.clone()
  homeUrl.pathname = '/home'
  homeUrl.search = ''
  return NextResponse.redirect(homeUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
