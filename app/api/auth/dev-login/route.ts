import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/auth/dev-login?email=you@example.com
 *
 * Temporary route to log in directly without email verification.
 * Sets the fp_session cookie and redirects to /dashboard.
 *
 * DELETE THIS ROUTE once Resend domain is verified.
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')

  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const sessionToken = await createSessionToken(user.id, user.email)

  const response = NextResponse.redirect(new URL('/dashboard', request.url))

  response.cookies.set('fp_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return response
}
