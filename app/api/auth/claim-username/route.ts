import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { RESERVED_SLUGS } from '@/lib/constants'

/**
 * POST /api/auth/claim-username
 *
 * Called from /welcome after OAuth/Magic Link signup.
 * Creates the user's primary footprint with their chosen username.
 * Requires an active session (user must be authenticated).
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('fp_session')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(token)
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const { username } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const clean = username.toLowerCase().trim()

    // Validate
    if (clean.length < 3 || clean.length > 20) {
      return NextResponse.json({ error: 'Username must be 3-20 characters.' }, { status: 400 })
    }
    if (!/^[a-z0-9-]+$/.test(clean)) {
      return NextResponse.json({ error: 'Lowercase letters, numbers, and hyphens only.' }, { status: 400 })
    }
    if (clean.startsWith('-') || clean.endsWith('-') || clean.includes('--')) {
      return NextResponse.json({ error: 'Invalid username format.' }, { status: 400 })
    }
    if ((RESERVED_SLUGS as readonly string[]).includes(clean)) {
      return NextResponse.json({ error: 'That name is reserved. Try another.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Check if user already has a footprint
    const { data: existingFp } = await supabase
      .from('footprints')
      .select('id, username')
      .eq('user_id', session.userId)
      .eq('is_primary', true)
      .single()

    if (existingFp) {
      return NextResponse.json({
        success: true,
        username: existingFp.username,
      })
    }

    // Check username availability
    const { data: taken } = await supabase
      .from('footprints')
      .select('username')
      .eq('username', clean)
      .maybeSingle()

    if (taken) {
      return NextResponse.json({ error: 'That name is taken. Try another.' }, { status: 409 })
    }

    // Create footprint
    const { error: fpErr } = await supabase.from('footprints').insert({
      user_id: session.userId,
      username: clean,
      display_name: clean,
      is_primary: true,
      published: false,
    })

    if (fpErr) {
      console.error('[claim-username] footprint insert error:', fpErr)
      if (fpErr.code === '23505') {
        return NextResponse.json({ error: 'That name was just taken. Try another.' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Could not create room. Try again.' }, { status: 500 })
    }

    console.log('[claim-username] success:', clean, session.userId)
    return NextResponse.json({ success: true, username: clean })
  } catch (err) {
    console.error('[claim-username] unexpected error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
