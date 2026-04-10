import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth'
import { createRouteHandlerSupabaseAuthClient } from '@/lib/supabase-auth-ssr'
import { ensurePrimaryFootprintForUser, findOrCreateUserByEmail } from '@/lib/primary-footprint'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const rawRedirect = searchParams.get('redirect') || ''
  // Prevent open redirects: only allow relative paths, never protocol-relative
  const customRedirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : ''

  // Handle errors
  if (error) {
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', errorDescription || 'Link expired')
    return NextResponse.redirect(loginUrl)
  }

  // Exchange code for session + bridge to custom JWT
  if (code) {
    try {
      const { supabase: authClient, applyPendingCookies } = createRouteHandlerSupabaseAuthClient(request)

      const { data: authData, error: exchangeError } = await authClient.auth.exchangeCodeForSession(code)
      
      if (exchangeError || !authData?.user?.email) {
        const loginUrl = new URL('/login', origin)
        loginUrl.searchParams.set('error', 'Link expired. Try again.')
        return NextResponse.redirect(loginUrl)
      }

      const email = authData.user.email

      const user = await findOrCreateUserByEmail(email)
      if (!user) {
        const loginUrl = new URL('/login', origin)
        loginUrl.searchParams.set('error', 'Could not open your footprint.')
        return NextResponse.redirect(loginUrl)
      }

      const footprint = await ensurePrimaryFootprintForUser(user.id)
      if (!footprint) {
        const loginUrl = new URL('/login', origin)
        loginUrl.searchParams.set('error', 'Could not open your footprint.')
        return NextResponse.redirect(loginUrl)
      }

      const sessionToken = await createSessionToken(user.id, user.email)
      const destination = customRedirect && customRedirect !== '/home'
        ? customRedirect
        : `/${footprint.slug}/home`

      const response = NextResponse.redirect(new URL(destination, origin))
      response.cookies.set(
        SESSION_COOKIE_NAME,
        sessionToken,
        getSessionCookieOptions(new URL(request.url).hostname)
      )

      return applyPendingCookies(response)
    } catch (err) {
      console.error('Callback error:', err)
      const loginUrl = new URL('/login', origin)
      loginUrl.searchParams.set('error', 'Something went wrong. Try again.')
      return NextResponse.redirect(loginUrl)
    }
  }

  // No code — redirect to login
  return NextResponse.redirect(new URL('/login', origin))
}
