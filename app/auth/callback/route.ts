import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { EmailOtpType, User } from '@supabase/supabase-js'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, normalizeEmail } from '@/lib/auth'
import { createRouteHandlerSupabaseAuthClient } from '@/lib/supabase-auth-ssr'
import { sanitizeRedirect } from '@/lib/redirect'

/**
 * GET /auth/callback
 *
 * ONE JOB: exchange the OAuth code (or verify the magic-link token_hash),
 * issue a session, and send the user to their own HOME. Never redirect to
 * /login, /welcome, /dashboard, or any other SaaS slop page.
 *
 * Dual branch by design:
 *   - ?code=...                  → PKCE exchange (OAuth + magic link when the
 *                                  link is opened in the same browser that
 *                                  requested it and still holds the verifier)
 *   - ?token_hash=...&type=...   → OTP verify (magic link opened in a
 *                                  different browser/app — Gmail→Safari etc.)
 *
 * On error we preserve Supabase's real reason (otp_expired, access_denied,
 * server_error, ...) in ?reason= on /auth/retry. /ae is never an auth
 * error destination — it's Ae's room, not a system fallback.
 *
 * If the user has no footprint yet, create a draft one immediately so they
 * always land in their own space.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const otpType = searchParams.get('type') as EmailOtpType | null
  const errParam = searchParams.get('error')
  const errCode = searchParams.get('error_code')

  // Read the slug from cookie or query param — where the user came from.
  // Cookie wins if valid; the ?redirect= query param is a backup for when
  // the cookie is stripped by cross-origin OAuth redirects or by opening
  // a magic link in a different browser than the one that requested it.
  const rawPostAuth = request.cookies.get('post_auth_redirect')?.value || ''
  const safePostAuth = sanitizeRedirect(rawPostAuth)
  const safeRedirectParam = sanitizeRedirect(searchParams.get('redirect'))

  // Every auth failure routes to /auth/retry — a neutral, Footprint-branded
  // page with one CTA. Reason strings are stable slugs carried in ?reason=
  // for diagnostics. /ae is never an auth error destination: it's a room,
  // not a system fallback.
  const redirectWithError = (reason: string) => {
    const errUrl = new URL('/auth/retry', origin)
    errUrl.searchParams.set('reason', reason)
    const response = NextResponse.redirect(errUrl)
    if (rawPostAuth) response.cookies.set('post_auth_redirect', '', { path: '/', maxAge: 0 })
    return response
  }

  // Supabase returned an error directly (e.g. link expired, access denied).
  // Preserve the specific code so the UI can say "otp_expired" not "oauth".
  if (errParam) {
    return redirectWithError(errCode || errParam)
  }
  if (!code && !tokenHash) {
    return redirectWithError('missing_params')
  }

  let stage = 'init'
  let applyPendingCookies: ((r: NextResponse) => NextResponse) = (r) => r

  try {
    const authSsr = createRouteHandlerSupabaseAuthClient(request)
    applyPendingCookies = authSsr.applyPendingCookies
    const authClient = authSsr.supabase

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Dual branch: verifyOtp (token_hash) vs exchangeCodeForSession (code) ──
    // verifyOtp returns { user: User | null; session: Session | null };
    // exchangeCodeForSession returns a stricter union. Unify on User so the
    // downstream code reads a single, non-null shape.
    let authUser: User
    if (tokenHash && otpType) {
      stage = 'verify'
      const { data, error: verifyError } = await authClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      })
      if (verifyError || !data?.user?.email) {
        console.error('[callback:verify]', verifyError)
        return applyPendingCookies(redirectWithError('verify'))
      }
      authUser = data.user
    } else {
      stage = 'exchange'
      const { data, error: exchangeError } = await authClient.auth.exchangeCodeForSession(code!)
      if (exchangeError || !data?.user?.email) {
        console.error('[callback:exchange]', exchangeError)
        return applyPendingCookies(redirectWithError('exchange'))
      }
      authUser = data.user
    }

    const email = normalizeEmail(authUser.email!)
    const providerName = authUser.app_metadata?.provider || 'email'
    const userMeta = authUser.user_metadata || {}
    const displayName = userMeta.full_name || userMeta.name || ''
    const avatarUrl = userMeta.avatar_url || userMeta.picture || ''

    stage = 'user'
    // Look up or create user
    let { data: user } = await supabase
      .from('users')
      .select('id, email, serial_number')
      .ilike('email', email)
      .single()

    if (!user) {
      const { data: newUser } = await supabase
        .from('users')
        .insert({
          email,
          auth_provider: providerName,
          oauth_provider_id: authUser.id,
          display_name: displayName,
          avatar_url: avatarUrl,
        })
        .select('id, email, serial_number')
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
      return applyPendingCookies(redirectWithError('user'))
    }

    stage = 'footprint'
    // ── Look up or create draft footprint ──
    // Every authenticated user must have a footprint so they always land
    // in their own HOME, never on someone else's page.
    //
    // Order matters: if the user has multiple footprints (draft + claimed,
    // or a few claimed slugs), prefer the primary one, then the oldest,
    // so the same user lands on the same page on every sign-in.
    let { data: footprint } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!footprint) {
      const draftSlug = `draft-${user.id.replace(/-/g, '').slice(0, 12)}`

      // claim_next_serial is required — serial_number is NOT NULL on footprints
      const { data: serialData } = await supabase.rpc('claim_next_serial')
      const serialNumber: number | null = serialData ?? null

      // Backfill user serial if missing (new users created via this callback)
      if (serialNumber && !user.serial_number) {
        await supabase
          .from('users')
          .update({ serial_number: serialNumber })
          .eq('id', user.id)
      }

      const { data: newFp } = await supabase
        .from('footprints')
        .insert({
          user_id: user.id,
          username: draftSlug,
          serial_number: serialNumber,
          is_primary: true,
          published: false,
          display_name: displayName || '',
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

    // Honor an explicit claim destination if one survived to the callback,
    // from either the cookie or the ?redirect= backup channel.
    const claimCandidate = safePostAuth ?? safeRedirectParam
    if (claimCandidate && claimCandidate !== '/home') {
      try {
        const parsed = new URL(claimCandidate, origin)
        if (parsed.searchParams.get('claim') === '1') {
          finalPath = claimCandidate
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
    return applyPendingCookies(redirectWithError(stage))
  }
}
