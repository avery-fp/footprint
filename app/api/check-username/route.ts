import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/check-username
 *
 * Public endpoint to check username availability during signup.
 * No auth required.
 */
export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ available: false, reason: 'Username required' })
    }

    const clean = username.toLowerCase().trim()

    if (clean.length < 2 || clean.length > 20) {
      return NextResponse.json({ available: false, reason: '2-20 characters' })
    }

    if (!/^[a-z0-9_]+$/.test(clean)) {
      return NextResponse.json({ available: false, reason: 'lowercase letters, numbers, underscores only' })
    }

    // Reserved slugs
    const reserved = [
      'admin', 'api', 'auth', 'build', 'checkout', 'signup', 'signin',
      'publish', 'success', 'docs', 'welcome', 'settings', 'home',
      'about', 'help', 'support', 'aro', 'example', 'deed', 'remix',
    ]
    if (reserved.includes(clean)) {
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
