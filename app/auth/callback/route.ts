import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { searchParams, hash, origin } = new URL(request.url)
  
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const redirect = searchParams.get('redirect') || '/dashboard'

  // Handle errors
  if (error) {
    const loginUrl = new URL('/auth/login', origin)
    loginUrl.searchParams.set('error', errorDescription || 'Link expired')
    return NextResponse.redirect(loginUrl)
  }

  // Exchange code for session + bridge to custom JWT
  if (code) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const { data: authData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (exchangeError || !authData?.user?.email) {
        const loginUrl = new URL('/auth/login', origin)
        loginUrl.searchParams.set('error', 'Link expired. Try again.')
        return NextResponse.redirect(loginUrl)
      }

      const email = authData.user.email

      // Find the user in our DB
      const { data: user } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', email)
        .single()

      if (!user) {
        const loginUrl = new URL('/auth/login', origin)
        loginUrl.searchParams.set('error', 'No account found.')
        return NextResponse.redirect(loginUrl)
      }

      // Create custom JWT session token — bridges supabase auth to our system
      const sessionToken = await createSessionToken(user.id, user.email)

      // Redirect to dashboard with session cookie set
      const response = NextResponse.redirect(new URL(redirect, origin))
      response.cookies.set('session', sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      })

      return response
    } catch (err) {
      console.error('Callback error:', err)
      const loginUrl = new URL('/auth/login', origin)
      loginUrl.searchParams.set('error', 'Something went wrong. Try again.')
      return NextResponse.redirect(loginUrl)
    }
  }

  // No code — redirect to login
  return NextResponse.redirect(new URL('/auth/login', origin))
}
