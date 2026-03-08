import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import * as bcrypt from 'bcryptjs'

/**
 * POST /api/signup
 *
 * Dead-simple signup: username + email + password.
 * Creates user + unpublished footprint, sets session cookie.
 */
export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse body ──
    const body = await request.json()
    const { username, email, password } = body || {}

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Username, email, and password are required.' }, { status: 400 })
    }

    const cleanUsername = String(username).toLowerCase().trim()
    const cleanEmail = String(email).toLowerCase().trim()

    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      return NextResponse.json({ error: 'Username must be 3-20 characters.' }, { status: 400 })
    }
    if (!/^[a-z0-9-]+$/.test(cleanUsername)) {
      return NextResponse.json({ error: 'Username: lowercase letters, numbers, hyphens only.' }, { status: 400 })
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    // ── 2. Connect to Supabase ──
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      console.error('[signup] MISSING ENV VARS:', { supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey })
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 3. Check email taken ──
    const { data: existingUser, error: emailCheckErr } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (emailCheckErr) {
      console.error('[signup] email check error:', emailCheckErr)
      return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }

    if (existingUser) {
      return NextResponse.json({ error: 'An account with that email already exists. Try logging in.' }, { status: 409 })
    }

    // ── 4. Check username taken ──
    const { data: existingFp, error: usernameCheckErr } = await supabase
      .from('footprints')
      .select('username')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (usernameCheckErr) {
      console.error('[signup] username check error:', usernameCheckErr)
      return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }

    if (existingFp) {
      return NextResponse.json({ error: 'That name is taken. Try another.' }, { status: 409 })
    }

    // ── 5. Create user ──
    const passwordHash = await bcrypt.hash(String(password), 10)

    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({ email: cleanEmail, password_hash: passwordHash })
      .select('id, email')
      .single()

    if (userErr || !user) {
      console.error('[signup] user insert error:', userErr)
      return NextResponse.json({ error: 'Could not create account. Try again.' }, { status: 500 })
    }

    // ── 6. Create footprint (serial assigned after Stripe payment in /api/publish) ──
    const { error: fpErr } = await supabase.from('footprints').insert({
      user_id: user.id,
      username: cleanUsername,
      display_name: cleanUsername,
      email: cleanEmail,
      is_primary: true,
      published: false,
    })

    if (fpErr) {
      console.error('[signup] footprint insert error:', fpErr)
      // User was created but footprint failed — still let them in
    }

    // ── 8. Session cookie ──
    const sessionToken = await createSessionToken(user.id, user.email)

    const response = NextResponse.json({
      success: true,
      slug: cleanUsername,
    })

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

    console.log('[signup] success:', cleanUsername, user.id)
    return response
  } catch (err: any) {
    console.error('[signup] unexpected error:', err?.message || err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
