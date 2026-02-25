import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSessionToken } from '@/lib/auth'
import * as bcrypt from 'bcryptjs'
import { loginSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/auth/login')

export async function POST(request: NextRequest) {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const v = validateBody(loginSchema, body)
    if (!v.success) return v.response
    const { email, password } = v.data

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (error || !user || !user.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const sessionToken = await createSessionToken(user.id, user.email)

    // Find user's primary footprint slug for direct redirect to editor
    const { data: primaryFp } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    const response = NextResponse.json({
      success: true,
      slug: primaryFp?.username || null,
    })
    const hostname = new URL(request.url).hostname
    const cookieDomain = hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
      ? '.footprint.onl'
      : undefined

    response.cookies.set('fp_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    })

    return response
  } catch (err: any) {
    log.error({ err }, 'Login failed')
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
