import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/src/aro/lib/auth'
import { getReactorState, setReactorActive } from '@/src/fp/wave/engine'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aro/reactor — reactor state + lights + recent jobs
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req)
  if (auth instanceof NextResponse) return auth

  try {
    const state = await getReactorState()
    return NextResponse.json(state)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/aro/reactor — toggle reactor { action: 'ignite' | 'pause' }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const action = body.action

    if (action !== 'ignite' && action !== 'pause') {
      return NextResponse.json(
        { error: 'Invalid action. Use "ignite" or "pause".' },
        { status: 400 }
      )
    }

    await setReactorActive(action === 'ignite')

    const state = await getReactorState()
    return NextResponse.json(state)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
