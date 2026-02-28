import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '@/lib/auth'
import { signupSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/signup')

/**
 * POST /api/signup
 *
 * Accepts { username, email, password } in body.
 * Creates a Supabase Auth user (server-side, bypasses email confirmation),
 * then creates a custom user record + unpublished footprint.
 * Sets fp_session cookie and returns slug.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(signupSchema, body)
    if (!v.success) return v.response
    const { username, email, password } = v.data

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const hostname = new URL(request.url).hostname
    const cookieDomain = hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
      ? '.footprint.onl'
      : undefined

    // Check if email already exists in our users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', email)
      .single()

    if (existingUser) {
      // Already has account — log them in via Supabase Auth
      const authClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const { error: signInError } = await authClient.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
      }

      const { data: fp } = await supabase
        .from('footprints')
        .select('username')
        .eq('user_id', existingUser.id)
        .eq('is_primary', true)
        .single()

      const sessionToken = await createSessionToken(existingUser.id, existingUser.email)
      const response = NextResponse.json({
        success: true,
        slug: fp?.username || null,
        existing: true,
      })

      response.cookies.set('fp_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        ...(cookieDomain && { domain: cookieDomain }),
      })

      return response
    }

    // Check if username is taken
    const { data: existingFp } = await supabase
      .from('footprints')
      .select('id')
      .eq('username', username)
      .single()

    if (existingFp) {
      return NextResponse.json({ error: 'That name is already claimed. Try another.' }, { status: 409 })
    }

    // Create Supabase Auth user (service role = bypasses email confirmation)
    const { error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      // If user already exists in Supabase Auth but not in our table, that's fine
      if (!authError.message?.includes('already been registered')) {
        log.error({ err: authError }, 'Supabase Auth user creation failed')
        return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
      }
    }

    // Create user in our custom users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({ email })
      .select()
      .single()

    if (userError || !user) {
      log.error({ err: userError }, 'User creation failed')
      return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }

    // Create unpublished footprint with chosen username
    const { error: fpError } = await supabase.from('footprints').insert({
      user_id: user.id,
      username,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      published: false,
    })

    if (fpError) {
      log.error({ err: fpError }, 'Footprint creation failed')
      return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }

    // Create session + set cookie
    const sessionToken = await createSessionToken(user.id, user.email)
    const response = NextResponse.json({
      success: true,
      slug: username,
      existing: false,
    })

    response.cookies.set('fp_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    })

    return response
  } catch (error: any) {
    log.error({ err: error }, 'Signup failed')
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
