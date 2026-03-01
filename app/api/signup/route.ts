import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import * as bcrypt from 'bcryptjs'
import { signupSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/signup')

/**
 * POST /api/signup
 *
 * Username + email + password signup.
 * Creates user + unpublished footprint with chosen username, sets fp_session cookie.
 * No serial number, no payment. Free to create.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(signupSchema, body)
    if (!v.success) return v.response
    const { email, username, password } = v.data

    const supabase = createServerSupabaseClient()

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, serial_number')
      .ilike('email', email)
      .single()

      ? '.footprint.onl'
      : undefined

    if (existingUser) {
      // Already has account — find their footprint and log them in
      let { data: fp } = await supabase
        .from('footprints')
        .select('username, published')
        .eq('user_id', existingUser.id)
        .eq('is_primary', true)
        .single()

      // If user exists but footprint is missing (orphaned from failed signup), create it now
      if (!fp) {
        const { error: fpError } = await supabase.from('footprints').insert({
          user_id: existingUser.id,
          username,
          name: 'Everything',
          is_primary: true,
          published: false,
        })
        if (!fpError) {
          fp = { username, published: false }
        }
      }

      const sessionToken = await createSessionToken(existingUser.id, existingUser.email)
      const response = NextResponse.json({
        success: true,
        slug: fp?.username || null,
        existing: true,
      })

      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

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
      log.error({ err: userError }, 'User creation failed')
      return NextResponse.json({ error: 'Something went wrong on our end. Try again in a moment.' }, { status: 500 })
    }

    // Create unpublished footprint with chosen username
    const { error: fpError } = await supabase.from('footprints').insert({
      user_id: user.id,
      username,
      name: 'Everything',
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
      slug: username,
      existing: false,
    })

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

    return response
  } catch (error: any) {
    log.error({ err: error }, 'Signup failed')
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
