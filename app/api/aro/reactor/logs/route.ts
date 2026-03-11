import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/src/aro/lib/auth'
import { getReactorLogs } from '@/src/fp/wave/engine'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/reactor/logs — last 50 engine job entries
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req)
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)

  try {
    const logs = await getReactorLogs(limit)
    return NextResponse.json({ logs })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
