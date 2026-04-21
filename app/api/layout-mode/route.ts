import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'

const VALID_MODES = ['grid']

/**
 * PATCH /api/layout-mode
 *
 * Body: { slug: string, grid_mode: 'grid' }
 * Requires edit_token for the slug.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { slug, grid_mode } = body

    if (!slug || !grid_mode || !VALID_MODES.includes(grid_mode)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('footprints')
      .update({ grid_mode })
      .eq('username', slug)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update layout mode' }, { status: 500 })
  }
}
