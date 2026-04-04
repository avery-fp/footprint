import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

/**
 * GET /auth/callback
 *
 * Handles OAuth + Magic Link callbacks from Supabase Auth.
 * Bridges Supabase auth to our custom JWT session system.
 *
 * Flow:
 * 1. Exchange code for Supabase session
 * 2. Look up or create user in our DB
 * 3. Issue fp_session JWT
 * 4. Redirect:
 *    - New user (no footprint) → /welcome (claim username)
 *    - Existing user → /dashboard
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const rawRedirect = searchParams.get('redirect') || ''
  const customRedirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : ''

  // Handle errors
  if (error) {
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', errorDescription || 'Sign-in failed. Try again.')
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

    const { data: authData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError || !authData?.user?.email) {
      const loginUrl = new URL('/login', origin)
      loginUrl.searchParams.set('error', 'Link expired. Try again.')
      return NextResponse.redirect(loginUrl)
    }

    const email = authData.user.email
    const providerName = authData.user.app_metadata?.provider || 'magic_link'
    const userMeta = authData.user.user_metadata || {}
    const displayName = userMeta.full_name || userMeta.name || ''
    const avatarUrl = userMeta.avatar_url || userMeta.picture || ''

    // Look up or create user in our DB
    let { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()

    let isNewUser = false

    if (!user) {
      // New user — create account
      isNewUser = true
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email,
          auth_provider: providerName,
          oauth_provider_id: authData.user.id,
          display_name: displayName,
          avatar_url: avatarUrl,
        })
        .select('id, email')
        .single()

      if (createError || !newUser) {
        console.error('[callback] Failed to create user:', createError)
        const loginUrl = new URL('/login', origin)
        loginUrl.searchParams.set('error', 'Could not create account. Try again.')
        return NextResponse.redirect(loginUrl)
      }

      user = newUser
    } else {
      // Existing user — update OAuth metadata if missing
      await supabase
        .from('users')
        .update({
          ...(displayName && { display_name: displayName }),
          ...(avatarUrl && { avatar_url: avatarUrl }),
          ...(!user.email && { email }),
        })
        .eq('id', user.id)
    }

    // Create our custom JWT session token
    const sessionToken = await createSessionToken(user.id, user.email)

    // Determine redirect destination
    let destination = customRedirect || '/dashboard'

    if (isNewUser) {
      // New user → send to /welcome to claim username
      destination = '/welcome'
    } else {
      // Existing user — check if they have a footprint
      const { data: footprint } = await supabase
        .from('footprints')
        .select('username')
        .eq('user_id', user.id)
        .eq('is_primary', true)
        .single()

      if (!footprint) {
        destination = '/welcome'
      }
    }

    const response = NextResponse.redirect(new URL(destination, origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

    return response
  } catch (err) {
    console.error('[callback] Error:', err)
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', 'Something went wrong. Try again.')
    return NextResponse.redirect(loginUrl)
  }
}
