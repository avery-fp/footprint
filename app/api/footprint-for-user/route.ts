import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * GET /api/footprint-for-user
 *
 * Returns the current authenticated user's primary footprint slug.
 * Used by /build to redirect users to their editor.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { data: footprint } = await supabase
      .from('footprints')
      .select('username, published')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'No footprint' }, { status: 404 })
    }

    return NextResponse.json({
      slug: footprint.username,
      published: footprint.published,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
