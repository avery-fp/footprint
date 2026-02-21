import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { setSessionCookie } from '@/lib/cookies'
import { nanoid } from 'nanoid'

/**
 * GET /api/auth/dev-login?email=you@example.com&link_footprint=ae
 *
 * Logs in directly without email verification.
 * Creates the user if they don't exist yet.
 * Optionally re-links an existing footprint via ?link_footprint=slug.
 *
 * DEVELOPMENT ONLY — blocked in production.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  try {
    const rawEmail = request.nextUrl.searchParams.get('email')
    const linkFootprint = request.nextUrl.searchParams.get('link_footprint')

    if (!rawEmail) {
      return NextResponse.json({ error: 'email query param required' }, { status: 400 })
    }

    const email = rawEmail.toLowerCase().trim()
    const supabase = createServerSupabaseClient()

    // Look up existing user
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .single()

    // Auto-create user if not found
    if (!user) {
      // Try claim_next_serial RPC first; fall back to max+1 if it doesn't exist
      let serialNumber: number
      const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')

      if (serialError || !serialData) {
        // Fallback: grab max serial and increment
        const { data: maxRow } = await supabase
          .from('users')
          .select('serial_number')
          .order('serial_number', { ascending: false })
          .limit(1)
          .single()
        serialNumber = (maxRow?.serial_number || 0) + 1
      } else {
        serialNumber = serialData
      }

      const username = `fp-${serialNumber}-${nanoid(4).toLowerCase()}`

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({ email, serial_number: serialNumber })
        .select()
        .single()

      if (userError || !newUser) {
        return NextResponse.json(
          { error: `Failed to create user: ${userError?.message}` },
          { status: 500 }
        )
      }

      user = newUser

      // Only create a default footprint if we're not about to link an existing one
      if (!linkFootprint) {
        await supabase.from('footprints').insert({
          user_id: user.id,
          username,
          serial_number: serialNumber,
          name: 'Everything',
          icon: '◈',
          is_primary: true,
          published: true,
        })
      }
    }

    // Link an existing footprint to this user
    if (linkFootprint) {
      const { data: fp } = await supabase
        .from('footprints')
        .select('id, user_id')
        .eq('username', linkFootprint)
        .single()

      if (fp) {
        await supabase
          .from('footprints')
          .update({ user_id: user.id, is_primary: true })
          .eq('id', fp.id)

        // Demote any other primary footprints for this user
        await supabase
          .from('footprints')
          .update({ is_primary: false })
          .eq('user_id', user.id)
          .neq('id', fp.id)
          .eq('is_primary', true)
      }
    }

    const sessionToken = await createSessionToken(user.id, user.email)

    // Find user's primary footprint slug for direct redirect to editor
    const { data: primaryFp } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single()

    const destination = primaryFp ? `/${primaryFp.username}/home` : '/build'
    const response = NextResponse.redirect(new URL(destination, request.url))

    setSessionCookie(response, sessionToken, new URL(request.url).hostname)

    return response
  } catch (err: any) {
    console.error('Dev-login error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal error', stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined },
      { status: 500 }
    )
  }
}
