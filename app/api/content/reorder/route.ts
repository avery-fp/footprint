import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

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
    const { footprint_id, updates } = body

    // Validate input
    if (!footprint_id || !updates || !Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'footprint_id and updates array required' },
        { status: 400 }
      )
    }

    // Verify user owns this footprint
    const userId = request.headers.get('x-user-id')
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
    console.error('Reorder error:', error)
    return NextResponse.json({ error: 'Failed to reorder content' }, { status: 500 })
  }
}
