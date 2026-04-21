import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuthForFootprintId } from '@/lib/edit-auth'
import { contentReorderSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/content/reorder')

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(contentReorderSchema, body)
    if (!v.success) return v.response
    const { footprint_id, updates } = v.data

    const auth = await getEditAuthForFootprintId(request, footprint_id)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const updatePromises = updates.map(({ id, position }: { id: string; position: number }) =>
      supabase
        .from('content')
        .update({ position })
        .eq('id', id)
        .eq('footprint_id', footprint_id)
    )

    await Promise.all(updatePromises)

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error({ err: error }, 'Reorder failed')
    return NextResponse.json({ error: 'Failed to reorder content' }, { status: 500 })
  }
}
