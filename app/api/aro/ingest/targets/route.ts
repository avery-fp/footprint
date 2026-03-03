import { NextRequest, NextResponse } from 'next/server'
import { ingestTargets } from '@/src/aro/targeting'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

/**
 * POST /api/aro/ingest/targets
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { source, payload } = body

    if (!source || !payload) {
      return NextResponse.json(
        { error: 'Required: { source: "csv"|"json"|"manual", payload: string|array }' },
        { status: 400 }
      )
    }

    const result = await ingestTargets({ source, payload })
    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
