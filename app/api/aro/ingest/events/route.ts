import { NextRequest, NextResponse } from 'next/server'
import { ingestEvents } from '@/src/aro/learning'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { aro_key, payload } = body

    if (!aro_key || aro_key !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

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
