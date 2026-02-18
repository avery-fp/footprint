import { NextRequest, NextResponse } from 'next/server'
import { ingestEvents } from '@/src/aro/learning'

export async function POST(request: NextRequest) {
  try {
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
    const message = err instanceof Error ? err.message : 'Ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
