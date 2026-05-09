import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rooms/[id]/unlock
 *
 * Body: { passcode: '1234' }
 *
 * Visitors verify a 4-digit guess against the bcrypt hash stored on the
 * room row. The hash itself is never returned. On success the client
 * stamps a sessionStorage flag so the room renders unblurred for the
 * tab's lifetime; closing the tab re-locks it on next paint.
 *
 * No rate limit by design — the brief is "gentle shake, no rate limit"
 * and 4 digits is intentionally low-friction. Bcrypt cost factor 10
 * makes brute force annoying without making the right code feel slow.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { passcode } = await request.json().catch(() => ({}))

    if (typeof passcode !== 'string' || !/^\d{4}$/.test(passcode)) {
      return NextResponse.json({ ok: false, error: 'invalid passcode' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: room } = await supabase
      .from('rooms')
      .select('is_locked, passcode_hash')
      .eq('id', params.id)
      .single()

    if (!room) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    }

    // A public room or a locked room with no hash both mean "no protection
    // to verify against." Surface as a soft 200 so the client treats it as
    // "unlocked" rather than getting a confusing error.
    if (!room.is_locked || !room.passcode_hash) {
      return NextResponse.json({ ok: true })
    }

    const ok = await bcrypt.compare(passcode, room.passcode_hash)
    return NextResponse.json({ ok })
  } catch {
    return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 })
  }
}
