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
 * 1. Exchange PKCE code + code_verifier for Supabase session
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Exchange the PKCE auth code for a session via Supabase's token endpoint.
    // We call the API directly because the SDK's exchangeCodeForSession reads
    // the code_verifier from its in-memory storage, which doesn't persist
    // across the two separate route handlers (OAuth initiation → callback).
    const codeVerifier = request.cookies.get('pkce_code_verifier')?.value

    let authUser: any = null

    if (codeVerifier) {
      // PKCE flow (OAuth via /api/auth/oauth)
      const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          auth_code: code,
          code_verifier: codeVerifier,
        }),
      })

      const tokenData = await tokenRes.json()

      if (!tokenRes.ok || !tokenData.user?.email) {
        console.error('[callback] PKCE token exchange failed:', tokenData)
        const loginUrl = new URL('/login', origin)
        loginUrl.searchParams.set('error', 'Sign-in failed. Try again.')
        return NextResponse.redirect(loginUrl)
      }

      authUser = tokenData.user
    } else {
      // Non-PKCE fallback (magic links, older flows)
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      const { data: authData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError || !authData?.user?.email) {
        const loginUrl = new URL('/login', origin)
        loginUrl.searchParams.set('error', 'Link expired. Try again.')
        return NextResponse.redirect(loginUrl)
      }

      authUser = authData.user
    }

    const email = authUser.email
    const providerName = authUser.app_metadata?.provider || 'magic_link'
    const userMeta = authUser.user_metadata || {}
    const displayName = userMeta.full_name || userMeta.name || ''
    const avatarUrl = userMeta.avatar_url || userMeta.picture || ''

    // DB operations use service role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

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
          oauth_provider_id: authUser.id,
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
    // Priority: post_auth_redirect cookie (set by /claim) > query param > default
    const rawPostAuth = request.cookies.get('post_auth_redirect')?.value || ''
    const postAuthRedirect = rawPostAuth.startsWith('/') && !rawPostAuth.startsWith('//') ? rawPostAuth : ''
    let destination = postAuthRedirect || customRedirect || '/dashboard'

    // Only apply /welcome fallback if no explicit redirect was requested
    if (!postAuthRedirect && !customRedirect) {
      if (isNewUser) {
        destination = '/welcome'
      } else {
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
    }

    const response = NextResponse.redirect(new URL(destination, origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

    // Clear PKCE and redirect cookies
    if (codeVerifier) {
      response.cookies.set('pkce_code_verifier', '', { path: '/', maxAge: 0 })
    }
    if (postAuthRedirect) {
      response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    }

    return response
  } catch (err) {
    console.error('[callback] Error:', err)
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('error', 'Something went wrong. Try again.')
    return NextResponse.redirect(loginUrl)
  }
}
