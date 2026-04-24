import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/draft/create')

/**
 * POST /api/draft/create
 *
 * Creates an anonymous draft footprint. No auth. user_id = null,
 * published = false, edit_token = null. Claims a real serial_number
 * because that column is the footprints PK (with 5 FK dependencies)
 * and cannot be null.
 *
 * Serials are effectively infinite (manufactured mythology starting at
 * 7777); burning one on an abandoned draft is acceptable. The user
 * never sees the serial until they claim.
 *
 * The tempSlug is an unguessable uuid prefix — knowledge of the slug
 * IS the edit credential during the draft phase. Once the user pays,
 * the webhook renames the row to the desired slug, attaches user_id,
 * issues the edit_token, and REUSES this draft's serial_number (it
 * does not claim another) — see app/api/webhook/route.ts.
 */
export async function POST(_request: NextRequest) {
  try {
    const draftId = (globalThis as any).crypto?.randomUUID?.()
      ?? require('crypto').randomUUID()
    const tempSlug = `draft-${draftId.slice(0, 12)}`

    const supabase = createServerSupabaseClient()

    // Claim a serial number up-front — footprints.serial_number is the PK.
    const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
    if (serialError || !serialData) {
      log.error({ err: serialError }, 'claim_next_serial failed for draft')
      return NextResponse.json(
        { error: 'Failed to allocate serial', detail: serialError?.message || null },
        { status: 500 }
      )
    }
    const serialNumber = serialData as number

    const row = {
      user_id: null as string | null,
      username: tempSlug,
      serial_number: serialNumber,
      published: false,
      is_primary: false,
    }

    const { error } = await supabase.from('footprints').insert(row)

    if (error) {
      log.error(
        { err: error, code: error.code, message: error.message, details: error.details, hint: error.hint, serialNumber, tempSlug },
        'Draft footprint insert failed'
      )
      return NextResponse.json(
        {
          error: 'Failed to create draft',
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
