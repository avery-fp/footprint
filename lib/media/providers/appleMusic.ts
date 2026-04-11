import type { IdentifiedMedia } from '../types'

const AM_PATTERN = /music\.apple\.com\/([a-z]{2})\/(album|playlist|song|station|music-video)\/([^/?]+)\/([a-z0-9.]+)/i

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const m = url.match(AM_PATTERN)

  // Extract title from URL slug
  const slug = m?.[3] || null
  const titleFromSlug = slug
    ? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null

  // OG scrape for album art + proper title
  let title: string | null = null
  let thumbnailUrl: string | null = null
  let authorName: string | null = null

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
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

      const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1]
      if (ogDesc) authorName = ogDesc.replace(/&amp;/g, '&')
    }
  } catch {
    // OG scrape failed — use slug-derived title
  }

  return {
    kind: 'music',
    provider: 'apple_music',
    title: title || titleFromSlug || 'Apple Music',
    subtitle: authorName ? null : 'Apple Music',
    authorName,
    thumbnailUrl,
    renderMode: 'preview_card',
    connectionRequired: false,
    rawMetadata: {
      country: m?.[1] || null,
      contentType: m?.[2] || null,
      slug,
      albumId: m?.[4] || null,
    },
  }
}
