import type { IdentifiedMedia } from '../types'

const IG_PATTERN = /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const m = url.match(IG_PATTERN)
  const postId = m?.[1] || null

  // Instagram has no public oEmbed — scrape OG metadata
  let title: string | null = null
  let thumbnailUrl: string | null = null

  // Strategy 1: Direct OG scrape (works when Instagram doesn't block)
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
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
    // OG scrape failed
  }

  // Strategy 2: Try Instagram's CDN embed endpoint (sometimes returns JSON with thumbnail)
  if (!thumbnailUrl && postId) {
    try {
      const embedRes = await fetch(`https://www.instagram.com/p/${postId}/embed/`, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      })
      if (embedRes.ok) {
        const embedHtml = await embedRes.text()
        // Embed pages often contain the image URL in various formats
        const imgMatch = embedHtml.match(/"display_url"\s*:\s*"([^"]+)"/)?.[1]
          || embedHtml.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/)?.[1]
          || embedHtml.match(/<img[^>]*class="[^"]*"[^>]*src="(https:\/\/[^"]*instagram[^"]*\.jpg[^"]*)"/i)?.[1]
        if (imgMatch) {
          thumbnailUrl = imgMatch.replace(/\\u0026/g, '&').replace(/\\/g, '')
        }
      }
    } catch {
      // Embed scrape failed
    }
  }

  return {
    kind: 'social',
    provider: 'instagram',
    title: title || 'Instagram Post',
    thumbnailUrl,
    renderMode: 'preview_card',
    connectionRequired: !thumbnailUrl,
    rawMetadata: { postId },
  }
}
