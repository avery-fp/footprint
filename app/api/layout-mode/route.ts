import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

const VALID_MODES = ['grid']

/**
 * PATCH /api/layout-mode
 *
 * Owner sets their default layout mode for a footprint.
 * Body: { slug: string, grid_mode: 'grid' }
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { slug, grid_mode } = body

    if (!slug || !grid_mode || !VALID_MODES.includes(grid_mode)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const { data: footprint } = await supabase
      .from('footprints')
      .select('id, user_id')
      .eq('username', slug)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update grid_mode
    const { error } = await supabase
      .from('footprints')
      .update({ grid_mode })
      .eq('id', footprint.id)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update layout mode' }, { status: 500 })
  }
}
