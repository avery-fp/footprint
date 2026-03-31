import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserIdFromRequest } from '@/lib/auth'
import { RESERVED_SLUGS } from '@/lib/constants'

/**
 * POST /api/auth/claim-username
 *
 * Called after OAuth signup — lets a new user pick their username
 * and creates their primary footprint.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const username = String(body?.username || '').toLowerCase().trim()

    // Validate
    if (username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: 'Username must be 3-20 characters.' }, { status: 400 })
    }
    if (!/^[a-z0-9-]+$/.test(username)) {
      return NextResponse.json({ error: 'Letters, numbers, and hyphens only.' }, { status: 400 })
    }
    if (username.startsWith('-') || username.endsWith('-') || username.includes('--')) {
      return NextResponse.json({ error: 'Invalid username format.' }, { status: 400 })
    }
    if ((RESERVED_SLUGS as readonly string[]).includes(username)) {
      return NextResponse.json({ error: 'That name is reserved.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user already has a footprint
    const { data: existingFp } = await supabase
      .from('footprints')
      .select('username')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single()

    if (existingFp) {
      // Already has a username — redirect them
      return NextResponse.json({ success: true, slug: existingFp.username })
    }

    // Check username availability
    const { data: taken } = await supabase
      .from('footprints')
      .select('username')
      .eq('username', username)
      .maybeSingle()

    if (taken) {
      return NextResponse.json({ error: 'That name is taken.' }, { status: 409 })
    }

    // Get user email for the footprint record
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()

    // Create footprint
    const { error: fpErr } = await supabase.from('footprints').insert({
      user_id: userId,
      username,
      display_name: username,
      email: user?.email || '',
      is_primary: true,
      published: false,
    })

    if (fpErr) {
      console.error('[claim-username] footprint insert error:', fpErr)
      return NextResponse.json({ error: 'Could not create footprint. Try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, slug: username })
  } catch (err) {
    console.error('[claim-username] error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
