import type { IdentifiedMedia } from '../types'

const SPOTIFY_PATTERN = /open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const m = url.match(SPOTIFY_PATTERN)
  if (!m) return { renderMode: 'link_only' }

  const contentType = m[1]
  const spotifyId = m[2]

  // oEmbed for title + album art (free, no API key)
  let title: string | null = null
  let thumbnailUrl: string | null = null
  let authorName: string | null = null

  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (res.ok) {
      const data = await res.json()
      title = data.title || null
      thumbnailUrl = data.thumbnail_url || null
      authorName = data.author_name || null
    }
  } catch {
    // oEmbed failed — proceed with minimal data
  }

  return {
    kind: 'music',
    provider: 'spotify',
    title: title || `Spotify ${contentType}`,
    authorName,
    thumbnailUrl,
    embedUrl: `https://open.spotify.com/embed/${contentType}/${spotifyId}?utm_source=generator&theme=0`,
    renderMode: 'preview_card',
    connectionRequired: false,
    rawMetadata: { spotifyId, contentType },
  }
}
