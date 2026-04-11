import type { IdentifiedMedia } from '../types'

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  // Extract video ID from standard URL format
  const m = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/) || url.match(/vm\.tiktok\.com\/([a-zA-Z0-9]+)/)
  const videoId = m?.[1] || null

  // oEmbed for title + thumbnail
  let title: string | null = null
  let thumbnailUrl: string | null = null
  let authorName: string | null = null

  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (res.ok) {
      const data = await res.json()
      title = data.title || null
      thumbnailUrl = data.thumbnail_url || null
      authorName = data.author_name || null
    }
  } catch {
    // oEmbed failed — fallback to preview card
  }

  return {
    kind: 'social',
    provider: 'tiktok',
    title: title || 'TikTok Video',
    authorName,
    thumbnailUrl,
    renderMode: thumbnailUrl ? 'preview_card' : 'preview_card',
    connectionRequired: false,
    rawMetadata: { videoId },
  }
}
