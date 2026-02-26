import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Block in production — leaks internal state
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const fpSession = request.cookies.get('fp_session')?.value || null

  return NextResponse.json({
    host: request.headers.get('host'),
    pathname: request.nextUrl.pathname,
    has_fp_session: !!fpSession,
    cookie_prefix: fpSession ? fpSession.substring(0, 12) : null,
    jwt_secret_set: !!process.env.JWT_SECRET,
    node_env: process.env.NODE_ENV,
  })
}
