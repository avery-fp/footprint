import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'

/**
 * POST /api/seed-rooms
 *
 * Body: { slug: string }
 * Verifies the caller holds edit_token for {slug}, then ensures the
 * footprint has default rooms seeded.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const slug: string | undefined = body?.slug

    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 })
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()
    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .maybeSingle()

    if (!footprint?.serial_number) {
      return NextResponse.json({ ok: true, seeded: 0 })
    }

    const { count } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('serial_number', footprint.serial_number)

    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: true, seeded: 0 })
    }

    const defaults = ['Home', 'Work', 'Play', 'Sound', 'About']
    const rows = defaults.map((name, i) => ({
      serial_number: footprint.serial_number,
      name,
      position: i,
    }))
    await supabase.from('rooms').insert(rows)

    return NextResponse.json({ ok: true, seeded: rows.length })
  } catch (err) {
    console.error('seed-rooms failed:', err)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}
