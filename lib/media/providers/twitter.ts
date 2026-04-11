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

  return {
    kind: 'social',
    provider: 'x',
    title: title || `Tweet by @${username}`,
    authorName,
    renderMode: 'preview_card',
    connectionRequired: false,
    rawMetadata: { tweetId, username },
  }
}
