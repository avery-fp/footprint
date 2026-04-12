import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, normalizeEmail } from '@/lib/auth'
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
    const errUrl = new URL(returnPath, origin)
    errUrl.searchParams.set('auth_error', 'oauth')
    const response = NextResponse.redirect(errUrl)
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    return response
  }

  let stage = 'init'
  let applyPendingCookies: ((r: NextResponse) => NextResponse) = (r) => r

  try {
    stage = 'exchange'
    const authSsr = createRouteHandlerSupabaseAuthClient(request)
    applyPendingCookies = authSsr.applyPendingCookies
    const authClient = authSsr.supabase

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: exchangeError } = await authClient.auth.exchangeCodeForSession(code)

    if (exchangeError || !authData?.user?.email) {
      console.error('[callback:exchange]', exchangeError)
      const errUrl = new URL(returnPath, origin)
      errUrl.searchParams.set('auth_error', 'exchange')
      const response = NextResponse.redirect(errUrl)
      if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
      return applyPendingCookies(response)
    }

    const email = normalizeEmail(authData.user.email)
    const providerName = authData.user.app_metadata?.provider || 'oauth'
    const userMeta = authData.user.user_metadata || {}
    const displayName = userMeta.full_name || userMeta.name || ''
    const avatarUrl = userMeta.avatar_url || userMeta.picture || ''

    stage = 'user'
    // Look up or create user
    let { data: user } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', email)
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
      console.error('[callback:user] user insert returned null')
      const errUrl = new URL(returnPath, origin)
      errUrl.searchParams.set('auth_error', 'user')
      const response = NextResponse.redirect(errUrl)
      if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
      return applyPendingCookies(response)
    }

    stage = 'footprint'
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

    stage = 'session'
    // Issue session
    const sessionToken = await createSessionToken(user.id, user.email)

    // Default: always send to user's own footprint home.
    // Only exception: a claim-flow redirect for a slug the user is actively
    // claiming/publishing. Parsed explicitly, not string-matched.
    let finalPath = footprint?.username
      ? `/${footprint.username}/home`
      : '/home'

    if (rawPostAuth.startsWith('/') && rawPostAuth !== '/home') {
      try {
        const parsed = new URL(rawPostAuth, origin)
        const isClaim = parsed.searchParams.get('claim') === '1'
        const isInternal = parsed.pathname.startsWith('/') && !parsed.pathname.startsWith('//')
        if (isClaim && isInternal) {
          finalPath = returnPath
        }
      } catch {
        // Malformed — ignore, use default
      }
    }

    // Use client-side location.replace() instead of a 302 redirect so the
    // OAuth callback URL is replaced in browser history rather than pushed.
    // This way pressing "back" from the editor skips the stale callback.
    const safeUrl = finalPath.replace(/"/g, '&quot;')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>window.location.replace("${safeUrl}")</script></body></html>`
    const response = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })

    return applyPendingCookies(response)
  } catch (err) {
    console.error(`[callback:${stage}]`, err)
    const errUrl = new URL(returnPath, origin)
    errUrl.searchParams.set('auth_error', stage)
    const response = NextResponse.redirect(errUrl)
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    return applyPendingCookies(response)
  }
}
