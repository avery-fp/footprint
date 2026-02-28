import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '@/lib/auth'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/signup')

/**
 * POST /api/signup
 *
 * Creates a user record + unpublished footprint after Supabase Auth signup.
 * Expects Authorization: Bearer <supabase_access_token> and { username } in body.
 * Sets fp_session cookie and returns slug.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username } = body

    if (!username || typeof username !== 'string' || username.length < 2) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const cleanUsername = username.toLowerCase().trim()

    // Extract Supabase access token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })
    }
    const accessToken = authHeader.slice(7)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify the Supabase token
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(accessToken)

    if (authError || !authUser?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const email = authUser.email

    const hostname = new URL(request.url).hostname
    const cookieDomain = hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
      ? '.footprint.onl'
      : undefined

    // Check if email already exists in our users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, serial_number')
      .ilike('email', email)
      .single()

    if (existingUser) {
      // Already has account — find their footprint and log them in
      const { data: fp } = await supabase
        .from('footprints')
        .select('username, published')
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
      .eq('username', cleanUsername)
      .single()

    if (existingFp) {
      return NextResponse.json({ error: 'That name is already claimed. Try another.' }, { status: 409 })
    }

    // Create user (no password_hash — Supabase Auth handles passwords)
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({ email })
      .select()
      .single()

    if (userError || !user) {
      log.error({ err: userError }, 'User creation failed')
      return NextResponse.json({ error: 'Something went wrong on our end. Try again in a moment.' }, { status: 500 })
    }

    // Create unpublished footprint with chosen username
    const { error: fpError } = await supabase.from('footprints').insert({
      user_id: user.id,
      username: cleanUsername,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      published: false,
    })

    if (fpError) {
      log.error({ err: fpError }, 'Footprint creation failed')
      return NextResponse.json({ error: 'Something went wrong on our end. Try again in a moment.' }, { status: 500 })
    }

    // Create session + set cookie
    const sessionToken = await createSessionToken(user.id, user.email)
    const response = NextResponse.json({
      success: true,
      slug: cleanUsername,
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
