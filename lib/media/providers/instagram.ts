import type { IdentifiedMedia } from '../types'

const IG_PATTERN = /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const m = url.match(IG_PATTERN)
  const postId = m?.[1] || null

  // Instagram has no public oEmbed — scrape OG metadata
  let title: string | null = null
  let thumbnailUrl: string | null = null

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (res.ok) {
      const html = await res.text()
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
      if (ogImage) thumbnailUrl = ogImage
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1]
      if (ogTitle) title = ogTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    }
  } catch {
    // OG scrape failed — preview card without thumbnail
  }

  return {
    kind: 'social',
    provider: 'instagram',
    title: title || 'Instagram Post',
    thumbnailUrl,
    renderMode: 'preview_card',
    connectionRequired: false,
    rawMetadata: { postId },
  }
}
