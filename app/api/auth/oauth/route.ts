import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseAuthClient, getCanonicalAppBaseUrl } from '@/lib/supabase-auth-ssr'

/**
 * POST /api/auth/oauth
 *
 * Initiates OAuth flow via Supabase Auth for Apple or Google.
 * Returns the redirect URL that the client should navigate to.
 */
export async function POST(request: NextRequest) {
  try {
    const { provider, redirect } = await request.json()

    if (!provider || !['google', 'apple'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const { supabase, applyPendingCookies } = createRouteHandlerSupabaseAuthClient(request)
    const baseUrl = getCanonicalAppBaseUrl(request)
    const callbackUrl = new URL('/auth/callback', baseUrl)
    // Pass post-auth redirect through the OAuth flow as a query param
    // so it survives even if the cookie doesn't make it through cross-origin redirects
    if (redirect && typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
      callbackUrl.searchParams.set('redirect', redirect)
    }
    const redirectTo = callbackUrl.toString()

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider as 'google' | 'apple',
      options: {
        redirectTo,
        queryParams: provider === 'google' ? {
          access_type: 'offline',
          prompt: 'consent',
        } : undefined,
      },
    })

    if (error || !data?.url) {
      console.error('[oauth] Supabase OAuth error:', error)
      return NextResponse.json({ error: 'Failed to start sign-in' }, { status: 500 })
    }

    return applyPendingCookies(NextResponse.json({ url: data.url }))
  } catch (err) {
    console.error('[oauth] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
