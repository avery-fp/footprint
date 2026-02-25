import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'
import { contentReorderSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/content/reorder')

/**
 * POST /api/content/reorder
 * 
 * Updates the position of multiple content items at once.
 * Called after drag-and-drop to persist the new order.
 * 
 * This is a batch update - we update all positions in one go
 * rather than making individual API calls for each item.
 * Much more efficient for the database.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(contentReorderSchema, body)
    if (!v.success) return v.response
    const { footprint_id, updates } = v.data

    // Verify user owns this footprint
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // Check footprint ownership
    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id')
      .eq('id', footprint_id)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Not your footprint' }, { status: 403 })
    }

    // Update each content item's position
    // We use Promise.all to do these in parallel for speed
    const updatePromises = updates.map(({ id, position }: { id: string; position: number }) =>
      supabase
        .from('content')
        .update({ position })
        .eq('id', id)
        .eq('footprint_id', footprint_id) // Extra safety check
    )

    await Promise.all(updatePromises)

    return NextResponse.json({ success: true })

  } catch (error) {
    log.error({ err: error }, 'Reorder failed')
    return NextResponse.json({ error: 'Failed to reorder content' }, { status: 500 })
  }
}
