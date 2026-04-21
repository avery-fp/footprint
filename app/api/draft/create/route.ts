import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/draft/create')

/**
 * POST /api/draft/create
 *
 * Creates an anonymous draft footprint. No auth. user_id = null,
 * published = false. Returns { tempSlug } so the client can navigate
 * to /{tempSlug}/home and start building.
 *
 * The temp slug is an unguessable uuid prefix — knowledge of the slug
 * IS the edit credential during the draft phase. Once the user pays,
 * the webhook renames the row to the desired slug and issues an
 * edit_token.
 */
export async function POST(_request: NextRequest) {
  try {
    const draftId = (globalThis as any).crypto?.randomUUID?.()
      ?? require('crypto').randomUUID()
    const tempSlug = `draft-${draftId.slice(0, 12)}`

    const supabase = createServerSupabaseClient()

    const { error } = await supabase.from('footprints').insert({
      user_id: null,
      username: tempSlug,
      name: 'Everything',
      icon: '◈',
      published: false,
      is_primary: false,
    })

    if (error) {
      log.error({ err: error }, 'Failed to insert draft footprint')
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
    }

    return NextResponse.json({ tempSlug })
  } catch (error) {
    log.error({ err: error }, 'Draft creation failed')
    return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
  }
}
