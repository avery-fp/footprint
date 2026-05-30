import { NextResponse } from 'next/server'
import { confidenceScore } from '@/lib/music/metadata'

export const runtime = 'nodejs'

type ITunesResult = {
  artistName?: string
  trackName?: string
  previewUrl?: string
  trackViewUrl?: string
  artworkUrl100?: string
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const artist = String(body.artist || '').trim()
    const title = String(body.title || '').trim()

    if (!artist || !title) {
      return NextResponse.json({ previewUrl: null, reason: 'missing_metadata' })
    }

    const term = encodeURIComponent(`${artist} ${title}`)
    const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=5`

    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } })
    if (!res.ok) {
      return NextResponse.json({ previewUrl: null, reason: 'itunes_failed' })
    }

    const data = await res.json()
    const results: ITunesResult[] = Array.isArray(data.results) ? data.results : []

    let best: null | {
      previewUrl: string
      appleUrl?: string
      artistName?: string
      trackName?: string
      artworkUrl?: string
      artistScore: number
      titleScore: number
      confidence: number
    } = null

    for (const result of results) {
      if (!result.previewUrl || !result.artistName || !result.trackName) continue

      const artistScore = confidenceScore(artist, result.artistName)
      const titleScore = confidenceScore(title, result.trackName)
      const confidence = Math.min(artistScore, titleScore)

      if (!best || confidence > best.confidence) {
        best = {
          previewUrl: result.previewUrl,
          appleUrl: result.trackViewUrl,
          artistName: result.artistName,
          trackName: result.trackName,
          artworkUrl: result.artworkUrl100,
          artistScore,
          titleScore,
          confidence,
        }
      }
    }

    if (!best || best.artistScore < 0.85 || best.titleScore < 0.85) {
      return NextResponse.json({
        previewUrl: null,
        reason: 'low_confidence',
      })
    }

    return NextResponse.json(best)
  } catch (error) {
    return NextResponse.json({ previewUrl: null, reason: 'error' }, { status: 200 })
  }
}
