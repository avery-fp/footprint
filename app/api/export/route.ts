import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'

/**
 * GET /api/export?slug=...
 *
 * Exports a single footprint as JSON. Requires edit_token for {slug}.
 */
export async function GET(request: NextRequest) {
  try {
    const slug = new URL(request.url).searchParams.get('slug')
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
      .select('*')
      .eq('username', slug)
      .maybeSingle()

    if (!footprint) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [{ data: library }, { data: links }, { data: rooms }] = await Promise.all([
      supabase.from('library').select('*').eq('serial_number', footprint.serial_number),
      supabase.from('links').select('*').eq('serial_number', footprint.serial_number),
      supabase.from('rooms').select('*').eq('serial_number', footprint.serial_number),
    ])

    return new NextResponse(
      JSON.stringify({
        exported_at: new Date().toISOString(),
        footprint,
        rooms: rooms || [],
        library: library || [],
        links: links || [],
      }, null, 2),
      {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="footprint-${slug}.json"`,
        },
      }
    )
  } catch (err) {
    console.error('Export failed:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
