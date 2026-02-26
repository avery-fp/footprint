import { NextRequest, NextResponse } from 'next/server'
import { ingestTargets } from '@/src/aro/targeting'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { aro_key, source, payload } = body

    if (!aro_key || aro_key !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    if (!source || !payload) {
      return NextResponse.json(
        { error: 'Required: { source: "csv"|"json"|"manual", payload: string|array }' },
        { status: 400 }
      )
    }

    const result = await ingestTargets({ source, payload })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
