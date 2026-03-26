import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=song`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    // Find first result with a previewUrl (skip collection wrapper)
    const song = data.results?.find(
      (r: Record<string, unknown>) => r.kind === 'song' && r.previewUrl
    ) || data.results?.[0]
    const previewUrl = song?.previewUrl || null
    return NextResponse.json({ previewUrl })
  } catch {
    return NextResponse.json({ previewUrl: null }, { status: 502 })
  }
}
