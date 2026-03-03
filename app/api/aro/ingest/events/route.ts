import { NextRequest, NextResponse } from 'next/server'
import { ingestEvents } from '@/src/aro/learning'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

/**
 * POST /api/aro/ingest/events
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { payload } = body

    if (!payload) {
      return NextResponse.json(
        { error: 'Required: { payload: string (CSV) | array }' },
        { status: 400 }
      )
    }

    const result = await ingestEvents(payload)
    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
