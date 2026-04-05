import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'OAuth not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'
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

    return NextResponse.json({ url: data.url })
  } catch (err) {
    console.error('[oauth] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
