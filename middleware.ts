import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware: host canonicalization + security headers. No auth.
 *
 * Rules:
 * 1. Apex footprint.onl → www.footprint.onl (301)
 * 2. Root / → /ae (the room IS the homepage)
 * 3. Legacy /home → / (old auth entry; identity is now Stripe)
 * 4. Everything else: pass through with security headers
 *
 * There is no session to check. Edit-gated routes (the editor, edit-scoped
 * API calls) verify the edit_token per-request via lib/edit-auth.ts.
 */

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://platform.twitter.com https://cdn.syndication.twimg.com${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https: data:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://player.vimeo.com https://w.soundcloud.com https://bandcamp.com https://maps.google.com https://codepen.io https://www.are.na https://www.figma.com https://embed.music.apple.com https://www.tiktok.com https://www.instagram.com https://platform.twitter.com https://syndication.twitter.com https://twitter.com",
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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get('host') || ''

  // 1. Apex → www
  if (host === 'footprint.onl') {
    const canonical = new URL(`https://www.footprint.onl${pathname}${search}`)
    return withSecurityHeaders(NextResponse.redirect(canonical, 301))
  }

  // 2. Root → /ae (showcase room, no auth)
  if (pathname === '/') {
    const dest = request.nextUrl.clone()
    dest.pathname = '/ae'
    return withSecurityHeaders(NextResponse.redirect(dest, 307))
  }

  // 3. Legacy /home → /
  if (pathname === '/home' || pathname.startsWith('/home/')) {
    const dest = request.nextUrl.clone()
    dest.pathname = '/'
    dest.search = ''
    return withSecurityHeaders(NextResponse.redirect(dest, 307))
  }

  // 4. SID attribution cookie — capture ?sid= on any route
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

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
