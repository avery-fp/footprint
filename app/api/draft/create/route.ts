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

    // Only fields we truly need. Everything else should fall back to the
    // column default. If the database still has NOT NULL on serial_number
    // or any other column we don't set, the insert will fail — migration
    // 023_draft_friendly_footprints.sql exists to fix that drift. Surface
    // the PG error in logs so future drift is diagnosable in Vercel.
    const row = {
      user_id: null as string | null,
      username: tempSlug,
      published: false,
      is_primary: false,
    }

    const { error } = await supabase.from('footprints').insert(row)

    if (error) {
      log.error(
        { err: error, code: error.code, message: error.message, details: error.details, hint: error.hint, row: { username: tempSlug } },
        'Draft footprint insert failed'
      )
      return NextResponse.json(
        {
          error: 'Failed to create draft',
          // Non-secret PG error envelope — helps triage a schema-drift
          // repeat without exposing anything sensitive. Safe because we
          // don't include user data.
          code: error.code || null,
          detail: error.message || null,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ tempSlug })
  } catch (error: any) {
    log.error({ err: error, message: error?.message }, 'Draft creation threw')
    return NextResponse.json(
      { error: 'Failed to create draft', detail: error?.message || null },
      { status: 500 }
    )
  }
}
