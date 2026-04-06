import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

/**
 * GET /auth/callback
 *
 * ONE JOB: exchange the OAuth code, issue a session, and return
 * to the slug with ?claim=1. Never redirect to /login, /welcome,
 * /dashboard, or any other SaaS slop page.
 *
 * The Sovereign Tile on PublicPage handles everything from there.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // Read the slug from cookie or query param — where the user came from
  const rawPostAuth = request.cookies.get('post_auth_redirect')?.value || ''
  const redirectParam = searchParams.get('redirect') || ''
  const returnPath = (rawPostAuth.startsWith('/') && !rawPostAuth.startsWith('//'))
    ? rawPostAuth
    : (redirectParam.startsWith('/') && !redirectParam.startsWith('//'))
    ? redirectParam
    : '/ae?claim=1' // absolute fallback — always a slug, never a SaaS page

  if (error || !code) {
    // Even on error, go back to the slug — the Sovereign Tile handles state
    const response = NextResponse.redirect(new URL(returnPath, origin))
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    return response
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError || !authData?.user?.email) {
      const response = NextResponse.redirect(new URL(returnPath, origin))
      if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
      return response
    }

    const email = authData.user.email
    const providerName = authData.user.app_metadata?.provider || 'oauth'
    const userMeta = authData.user.user_metadata || {}
    const displayName = userMeta.full_name || userMeta.name || ''
    const avatarUrl = userMeta.avatar_url || userMeta.picture || ''

    // Look up or create user
    let { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()

    if (!user) {
      const { data: newUser } = await supabase
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

      user = newUser
    } else {
      // Update metadata if missing
      await supabase
        .from('users')
        .update({
          ...(displayName && { display_name: displayName }),
          ...(avatarUrl && { avatar_url: avatarUrl }),
        })
        .eq('id', user.id)
    }

    if (!user) {
      // Creation failed — still go back to the slug
      const response = NextResponse.redirect(new URL(returnPath, origin))
      if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
      return response
    }

    // Issue session
    const sessionToken = await createSessionToken(user.id, user.email)

    // Always return to the slug with ?claim=1
    const response = NextResponse.redirect(new URL(returnPath, origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })

    return response
  } catch (err) {
    console.error('[callback]', err)
    const response = NextResponse.redirect(new URL(returnPath, origin))
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    return response
  }
}
