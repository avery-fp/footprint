import { NextRequest, NextResponse } from 'next/server'
import { isMachineAuthed } from '@/src/aro/lib/auth'
import { runEngine } from '@/src/fp/wave/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // allow up to 60s for scan + generate

/**
 * POST /api/aro/reactor/cycle — run one engine cycle.
 * Auth: CRON_SECRET only (called by Vercel cron).
 */
export async function POST(req: NextRequest) {
  if (!isMachineAuthed(req, 'cron')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runEngine()
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, status: 'failed' },
      { status: 500 }
    )
  }
}
