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

function extractAppleTrackId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const i = parsed.searchParams.get('i')
    if (i) return i

    const match = parsed.pathname.match(/id(\d+)/)
    return match?.[1] || null
  } catch {
    return null
  }
}

async function resolveAppleExact(url: string) {
  const id = extractAppleTrackId(url)
  if (!id) return null

  const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`)
  if (!res.ok) return null

  const data = await res.json()
  const result = Array.isArray(data.results) ? data.results.find((r: ITunesResult) => r.previewUrl) : null

  if (!result?.previewUrl) return null

  return {
    previewUrl: result.previewUrl,
    appleUrl: result.trackViewUrl,
    artistName: result.artistName,
    trackName: result.trackName,
    artworkUrl: result.artworkUrl100,
    confidence: 1,
    source: 'apple_lookup',
  }
}

async function resolveSpotifyMetadata(url: string) {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null

    const data = await res.json()
    const rawTitle = String(data.title || '').trim()
    const author = String(data.author_name || '').trim()

    // Spotify oEmbed varies. Keep it conservative.
    const cleanedTitle = rawTitle
      .replace(/\s*\|\s*Spotify\s*$/i, '')
      .replace(/\s*-\s*song by.*$/i, '')
      .trim()

    return {
      artist: author,
      title: cleanedTitle,
    }
  } catch {
    return null
  }
}

async function resolveITunesAlbumPreview(albumTitle: string) {
  if (!albumTitle) return null

  const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(albumTitle)}&entity=album&limit=5`
  const searchRes = await fetch(searchUrl, { next: { revalidate: 60 * 60 * 24 * 7 } })
  if (!searchRes.ok) return null

  const searchData = await searchRes.json()
  const albums = Array.isArray(searchData.results) ? searchData.results : []

  let bestAlbum: any = null
  let bestScore = 0

  for (const album of albums) {
    const score = confidenceScore(albumTitle, String(album.collectionName || ''))
    if (score > bestScore) {
      bestAlbum = album
      bestScore = score
    }
  }

  if (!bestAlbum?.collectionId || bestScore < 0.85) return null

  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(bestAlbum.collectionId)}&entity=song`
  const lookupRes = await fetch(lookupUrl, { next: { revalidate: 60 * 60 * 24 * 7 } })
  if (!lookupRes.ok) return null

  const lookupData = await lookupRes.json()
  const tracks = Array.isArray(lookupData.results)
    ? lookupData.results.filter((item: any) => item.wrapperType === 'track' && item.previewUrl)
    : []

  const firstTrack = tracks[0]
  if (!firstTrack?.previewUrl) return null

  return {
    previewUrl: firstTrack.previewUrl,
    appleUrl: firstTrack.trackViewUrl,
    artistName: firstTrack.artistName,
    trackName: firstTrack.trackName,
    artworkUrl: firstTrack.artworkUrl100,
    artistScore: bestScore,
    titleScore: 1,
    confidence: bestScore,
    source: 'itunes_album_first_track',
  }
}

async function resolveITunesPreview(artist: string, title: string) {
  if (!artist || !title) return null

  const term = encodeURIComponent(`${artist} ${title}`)
  const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5`, {
    next: { revalidate: 60 * 60 * 24 * 7 },
  })

  if (!res.ok) return null

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
    source: string
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
        source: 'itunes_search',
      }
    }
  }

  if (!best || best.artistScore < 0.85 || best.titleScore < 0.85) return null
  return best
}

async function resolveITunesPreviewByTitleOnly(title: string) {
  if (!title) return null

  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=song&limit=10`, {
    next: { revalidate: 60 * 60 * 24 * 7 },
  })

  if (!res.ok) return null

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
    source: string
  } = null

  for (const result of results) {
    if (!result.previewUrl || !result.trackName) continue

    const titleScore = confidenceScore(title, result.trackName)

    if (!best || titleScore > best.titleScore) {
      best = {
        previewUrl: result.previewUrl,
        appleUrl: result.trackViewUrl,
        artistName: result.artistName,
        trackName: result.trackName,
        artworkUrl: result.artworkUrl100,
        artistScore: 1,
        titleScore,
        confidence: titleScore,
        source: 'itunes_title_only',
      }
    }
  }

  if (!best || best.titleScore < 0.92) return null
  return best
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const url = String(body.url || body.externalUrl || '').trim()
    let artist = String(body.artist || '').trim()
    let title = String(body.title || '').trim()

    console.log('\n=== [MUSIC PREVIEW RESOLVER] ===')
    console.log('incoming:', { url, artist, title })

    if (url.includes('music.apple.com') || url.includes('itunes.apple.com')) {
      const exact = await resolveAppleExact(url)
      if (exact) {
        console.log('apple exact match:', exact)
        return NextResponse.json(exact)
      }
    }

    if (url.includes('open.spotify.com') && (!artist || !title)) {
      const spotifyMeta = await resolveSpotifyMetadata(url)
      if (spotifyMeta?.artist) artist = spotifyMeta.artist
      if (spotifyMeta?.title) title = spotifyMeta.title
      console.log('spotify oembed resolved:', { artist, title })
    }

    let preview = await resolveITunesPreview(artist, title)

    // No title-only fallback. Wrong-version audio is worse than no preview.

    if (!preview && url.includes('open.spotify.com/album')) {
      preview = await resolveITunesAlbumPreview(title)
      if (preview) console.log('album fallback hit:', preview)
    }

    if (!preview) {
      const miss = {
        previewUrl: null,
        reason: 'no_confident_preview',
        resolvedFrom: { artist, title, url },
      }
      console.log('resolver miss:', miss)
      return NextResponse.json(miss)
    }

    console.log('resolver hit:', preview)
    return NextResponse.json(preview)
  } catch {
    return NextResponse.json({ previewUrl: null, reason: 'error' }, { status: 200 })
  }
}
