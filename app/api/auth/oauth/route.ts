import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseAuthClient, getCanonicalAppBaseUrl } from '@/lib/supabase-auth-ssr'

/**
 * POST /api/auth/oauth
 *
 * Starts Google OAuth using the Supabase SSR client so PKCE state
 * is persisted in cookies for the callback exchange.
 */
export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()

    if (provider !== 'google') {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const { supabase, applyPendingCookies } = createRouteHandlerSupabaseAuthClient(request)
    const redirectTo = `${getCanonicalAppBaseUrl()}/auth/callback`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
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
