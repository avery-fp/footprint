import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/src/aro/lib/auth'
import { getHealthSummary } from '@/src/aro/monitor'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/reactor — swarm health status
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req)
  if (auth instanceof NextResponse) return auth

  try {
    const health = await getHealthSummary()
    return NextResponse.json({ status: 'ok', ...health })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/aro/reactor — no-op (swarm managed via CLI)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession(req)
  if (auth instanceof NextResponse) return auth

  return NextResponse.json({
    message: 'Reactor control moved to CLI. Use: npm run aro:swarm',
  })
}
