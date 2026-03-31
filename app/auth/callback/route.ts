import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

/**
 * GET /auth/callback
 *
 * Handles OAuth (Apple, Google) and magic link callbacks from Supabase Auth.
 * Bridges the Supabase session to our custom JWT system.
 *
 * Account linking: if a user with the same email already exists,
 * we log them into that account rather than creating a duplicate.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const rawRedirect = searchParams.get('redirect') || ''
  // Prevent open redirects: only allow relative paths
  const customRedirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : ''

  if (error) {
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', errorDescription || 'Something went wrong')
    return NextResponse.redirect(loginUrl)
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Exchange the code for a Supabase Auth session
    const { data: authData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError || !authData?.user?.email) {
      console.error('[auth/callback] exchange error:', exchangeError)
      const loginUrl = new URL('/login', origin)
      loginUrl.searchParams.set('error', 'Link expired. Try again.')
      return NextResponse.redirect(loginUrl)
    }

    const email = authData.user.email.toLowerCase().trim()
    const provider = authData.user.app_metadata?.provider || 'unknown'
    const providerName = authData.user.user_metadata?.full_name
      || authData.user.user_metadata?.name
      || null

    // ── Find existing user by email ──
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()

    let userId: string
    let isNewUser = false

    if (existingUser) {
      // Existing user — log them in (account linking by email match)
      userId = existingUser.id

      // Store the auth provider for future reference
      await supabase.from('auth_providers').upsert({
        user_id: userId,
        provider,
        provider_user_id: authData.user.id,
        email,
      }, { onConflict: 'user_id,provider' }).then(() => {})
    } else {
      // New user — create account (no password, OAuth-only for now)
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({ email, password_hash: null })
        .select('id, email')
        .single()

      if (createError || !newUser) {
        console.error('[auth/callback] user create error:', createError)
        const loginUrl = new URL('/login', origin)
        loginUrl.searchParams.set('error', 'Could not create account. Try again.')
        return NextResponse.redirect(loginUrl)
      }

      userId = newUser.id
      isNewUser = true

      // Store auth provider
      await supabase.from('auth_providers').insert({
        user_id: userId,
        provider,
        provider_user_id: authData.user.id,
        email,
      }).then(() => {})
    }

    // Create our custom JWT session
    const sessionToken = await createSessionToken(userId, email)

    // New users go to username selection; returning users go to their destination
    let destination = customRedirect || '/dashboard'
    if (isNewUser) {
      const nameParam = providerName ? `?name=${encodeURIComponent(providerName)}` : ''
      destination = `/welcome${nameParam}`
    }

    const response = NextResponse.redirect(new URL(destination, origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

    return response
  } catch (err) {
    console.error('[auth/callback] unexpected error:', err)
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', 'Something went wrong. Try again.')
    return NextResponse.redirect(loginUrl)
  }
}
