import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken } from '@/lib/auth'
import * as bcrypt from 'bcryptjs'

/**
 * POST /api/signup
 *
 * Username + email + password signup.
 * Creates user + unpublished footprint with chosen username, sets fp_session cookie.
 * No serial number, no payment. Free to create.
 */
export async function POST(request: NextRequest) {
  try {
    const { username: rawUsername, email: rawEmail, password } = await request.json()

    if (!rawEmail || !rawUsername || !password) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }

    const email = rawEmail.toLowerCase().trim()
    const username = rawUsername.toLowerCase().trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    if (!/^[a-z0-9_]+$/.test(username) || username.length < 2 || username.length > 20) {
      return NextResponse.json({ error: 'Names can only contain letters, numbers, and underscores.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, serial_number')
      .ilike('email', email)
      .single()

    const hostname = new URL(request.url).hostname
    const cookieDomain = hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
      ? '.footprint.onl'
      : undefined

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
      .eq('username', username)
      .single()

    if (existingFp) {
      return NextResponse.json({ error: 'That name is already claimed. Try another.' }, { status: 409 })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user (no serial number — unpublished)
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({ email, password_hash: passwordHash })
      .select()
      .single()

    if (userError || !user) {
      console.error('Signup user creation failed:', userError)
      return NextResponse.json({ error: 'Something went wrong on our end. Try again in a moment.' }, { status: 500 })
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
      console.error('Signup footprint creation failed:', fpError)
      return NextResponse.json({ error: 'Something went wrong on our end. Try again in a moment.' }, { status: 500 })
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
    console.error('Signup error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
