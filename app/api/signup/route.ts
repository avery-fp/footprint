import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken } from '@/lib/auth'
import { nanoid } from 'nanoid'

/**
 * POST /api/signup
 *
 * Email-only signup. No password. No payment.
 * Creates user + unpublished footprint, sets fp_session cookie.
 * Returns slug for redirect to /build.
 */
export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail } = await request.json()

    if (!rawEmail) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const email = rawEmail.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Check if user already exists
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

    // New user — create without serial number (unpublished)
    // Generate a temporary username (will be replaced at publish time)
    const tempUsername = `draft-${nanoid(8).toLowerCase()}`

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({ email })
      .select()
      .single()

    if (userError || !user) {
      console.error('Signup user creation failed:', userError)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    // Create unpublished footprint (no serial number yet)
    const { error: fpError } = await supabase.from('footprints').insert({
      user_id: user.id,
      username: tempUsername,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      published: false,
    })

    if (fpError) {
      console.error('Signup footprint creation failed:', fpError)
      return NextResponse.json({ error: 'Failed to create page' }, { status: 500 })
    }

    // Create default room
    // We can't use serial_number-based rooms yet since user has no serial
    // Rooms will be created when the user publishes and gets a serial

    // Create session + set cookie
    const sessionToken = await createSessionToken(user.id, user.email)
    const response = NextResponse.json({
      success: true,
      slug: tempUsername,
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
