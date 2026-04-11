import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/search/footprints?q=query
 *
 * Returns published footprints matching the query by username or display_name.
 * Public endpoint — no auth required.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] })
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('footprints')
    .select('username, display_name')
    .eq('published', true)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order('username', { ascending: true })
    .limit(8)

  if (error) {
    return NextResponse.json({ results: [] })
  }

  return NextResponse.json({
    results: (data || []).map(r => ({
      username: r.username,
      display_name: r.display_name || null,
    })),
  })
}
