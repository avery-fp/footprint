import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const redirect = searchParams.get('redirect') || '/dashboard'

  // Handle errors — expired link, invalid token, etc
  if (error) {
    // Redirect to login with error message
    const loginUrl = new URL('/auth/login', origin)
    loginUrl.searchParams.set('error', errorDescription || 'Link expired')
    loginUrl.searchParams.set('redirect', redirect)
    return NextResponse.redirect(loginUrl)
  }

  // Exchange the code for a session
  if (code) {
    const supabase = createServerSupabaseClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      const loginUrl = new URL('/auth/login', origin)
      loginUrl.searchParams.set('error', 'Link expired. Request a new one.')
      loginUrl.searchParams.set('redirect', redirect)
      return NextResponse.redirect(loginUrl)
    }

    // Success — send them to dashboard
    return NextResponse.redirect(new URL(redirect, origin))
  }

  // No code, no error — just redirect to login
  return NextResponse.redirect(new URL('/auth/login', origin))
}
