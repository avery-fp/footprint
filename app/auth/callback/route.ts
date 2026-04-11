import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { createRouteHandlerSupabaseAuthClient } from '@/lib/supabase-auth-ssr'

/**
 * GET /auth/callback
 *
 * ONE JOB: exchange the OAuth code, issue a session, and send the
 * user to their own HOME. Never redirect to /login, /welcome,
 * /dashboard, or any other SaaS slop page.
 *
 * If the user has no footprint yet, create a draft one immediately
 * so they always land in their own space.
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
    : '/home' // absolute fallback — resolve to user's own home

  if (error || !code) {
    // Even on error, go back to the slug — the Sovereign Tile handles state
    const response = NextResponse.redirect(new URL(returnPath, origin))
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    return response
  }

  try {
    const { supabase: authClient, applyPendingCookies } = createRouteHandlerSupabaseAuthClient(request)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: exchangeError } = await authClient.auth.exchangeCodeForSession(code)

    if (exchangeError || !authData?.user?.email) {
      const response = NextResponse.redirect(new URL(returnPath, origin))
      if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
      return applyPendingCookies(response)
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
      // Creation failed — still go back
      const response = NextResponse.redirect(new URL(returnPath, origin))
      if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
      return applyPendingCookies(response)
    }

    // ── Look up or create draft footprint ──
    // Every authenticated user must have a footprint so they always land
    // in their own HOME, never on someone else's page.
    let { data: footprint } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (!footprint) {
      const draftSlug = `draft-${user.id.replace(/-/g, '').slice(0, 12)}`
      const { data: newFp } = await supabase
        .from('footprints')
        .insert({
          user_id: user.id,
          username: draftSlug,
          name: 'Everything',
          is_primary: true,
          published: false,
          display_name: displayName || '',
          avatar_url: avatarUrl || '',
        })
        .select('username')
        .single()

      footprint = newFp
    }

    // Issue session
    const sessionToken = await createSessionToken(user.id, user.email)

    // Determine where to send the user.
    // If an explicit post_auth_redirect was set (e.g. SovereignTile publish
    // flow with ?claim=1&username=...), honour it so the publish ceremony
    // can complete. Otherwise, send them to their own HOME.
    const isExplicitRedirect = rawPostAuth.startsWith('/') && rawPostAuth !== '/home'
    const finalPath = isExplicitRedirect
      ? returnPath
      : footprint?.username
        ? `/${footprint.username}/home`
        : '/home'

    const response = NextResponse.redirect(new URL(finalPath, origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })

    return applyPendingCookies(response)
  } catch (err) {
    console.error('[callback]', err)
    const response = NextResponse.redirect(new URL(returnPath, origin))
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    return response
  }
}
