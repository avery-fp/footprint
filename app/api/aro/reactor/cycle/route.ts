import { NextResponse } from 'next/server'
import { runCycle } from '@/src/aro/swarm'

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (token !== process.env.ARO_KEY && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runCycle({ once: true })
    return NextResponse.json({ ok: true, result })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
