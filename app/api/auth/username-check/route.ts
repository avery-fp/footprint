import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Reserved words
const RESERVED_WORDS = [
  'admin', 'footprint', 'api', 'www', 'auth', 'build', 'checkout',
  'signup', 'signin', 'login', 'publish', 'success', 'docs', 'welcome',
  'settings', 'home', 'about', 'help', 'support', 'aro', 'example',
  'deed', 'remix', 'dashboard', 'public', 'static', 'assets',
]

/**
 * POST /api/auth/username-check
 *
 * Quick availability check for the username field (debounced from client).
 * Returns { available: boolean } — no reason text, color-only feedback.
 */
export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ available: false })
    }

    const clean = username.toLowerCase().trim()

    // Validate format: 3-20 chars, lowercase alphanumeric + hyphens
    if (clean.length < 3 || clean.length > 20) {
      return NextResponse.json({ available: false })
    }
    if (!/^[a-z0-9-]+$/.test(clean)) {
      return NextResponse.json({ available: false })
    }
    // No leading/trailing hyphens, no double hyphens
    if (clean.startsWith('-') || clean.endsWith('-') || clean.includes('--')) {
      return NextResponse.json({ available: false })
    }

    // Reserved words
    if (RESERVED_WORDS.includes(clean)) {
      return NextResponse.json({ available: false })
    }

    const supabase = createServerSupabaseClient()

    // Check footprints table (existing users)
    const { data: existing } = await supabase
      .from('footprints')
      .select('id')
      .eq('username', clean)
      .single()

    if (existing) {
      return NextResponse.json({ available: false })
    }

    return NextResponse.json({ available: true })
  } catch {
    return NextResponse.json({ available: false })
  }
}
