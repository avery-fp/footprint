import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { RESERVED_SLUGS } from '@/lib/constants'

/**
 * POST /api/check-username
 *
 * Public endpoint to check username availability during claim.
 * No auth required.
 */
export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ available: false, reason: 'Username required' })
    }

    const clean = username.toLowerCase().trim()

    if (clean.length < 2 || clean.length > 40) {
      return NextResponse.json({ available: false, reason: '2-40 characters' })
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(clean) && clean.length > 1) {
      return NextResponse.json({ available: false, reason: 'letters, numbers, dashes only' })
    }

    if (
      (RESERVED_SLUGS as readonly string[]).includes(clean) ||
      clean.startsWith('draft-') ||
      clean.startsWith('pending-')
    ) {
      return NextResponse.json({ available: false, reason: 'reserved' })
    }

    const supabase = createServerSupabaseClient()

    const { data: existing } = await supabase
      .from('footprints')
      .select('id')
      .eq('username', clean)
      .single()

    if (existing) {
      return NextResponse.json({ available: false, reason: 'taken' })
    }

    return NextResponse.json({ available: true })
  } catch (error) {
    console.error('Check username error:', error)
    return NextResponse.json({ available: false, reason: 'error' })
  }
}
