import type { IdentifiedMedia } from '../types'

const TWEET_PATTERN = /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const m = url.match(TWEET_PATTERN)
  if (!m) return { renderMode: 'link_only' }

  const username = m[1]
  const tweetId = m[2]

  // oEmbed for tweet text + author
  let title: string | null = null
  let authorName: string | null = `@${username}`
  let thumbnailUrl: string | null = null

  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (res.ok) {
      const data = await res.json()
      authorName = data.author_name || authorName
      // Extract tweet text from html field
      if (data.html) {
        const pMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/)
        if (pMatch) {
          title = pMatch[1].replace(/<[^>]+>/g, '').trim() || null
        }
      }
    }
  } catch {
    // oEmbed failed — proceed with handle only
  }

  // Fetch OG image from tweet page (link previews use this)
  try {
    const pageRes = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (pageRes.ok) {
      const html = await pageRes.text()
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
        || html.match(/<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i)?.[1]
      if (ogImage && !ogImage.includes('profile_images')) {
        // Skip profile avatars — only use actual tweet media
        thumbnailUrl = ogImage
      }
    }
  } catch {
    // Page fetch failed — text-only tile
  }

  return {
    kind: 'social',
    provider: 'x',
    title: title || `Tweet by @${username}`,
    authorName,
    thumbnailUrl,
    renderMode: 'preview_card',
    connectionRequired: false,
    rawMetadata: { tweetId, username },
  }
}
