/**
 * POSTPACK AGENT — generates contextual comments for each platform.
 *
 * NOT generic copy. Each comment is tailored to the specific thread
 * and platform. Uses Claude Haiku for speed + cost efficiency.
 *
 * The room footprint.onl/ae has 130+ tiles spanning basketball, music,
 * anime, fashion, film, architecture, and more — so a single room
 * is relevant across dozens of communities.
 */

import type { ScanTarget, Platform } from './scanner.js'

// ─── Types ──────────────────────────────────────────────

export interface PostpackInput {
  room_url: string
  target: ScanTarget
}

export interface PostpackOutput {
  comment_text: string
  platform: Platform
  target_url: string
  thread_title: string
  context: string
  metadata: {
    room_url: string
    generated_at: string
    model: string
  }
}

// ─── Room content library ───────────────────────────────
//
// The ae room has specific tiles that connect to different communities.
// Postpack uses this to reference actual content, not generic claims.

const ae_CONTENT: Record<string, string[]> = {
  sports: [
    'michael jordan dunking in the bulls jersey',
    'that mj dunk photo from the free throw line',
    'the jordan bulls era photography',
  ],
  music: [
    'mac miller mirror on spotify',
    'mase album cover',
    '"endless > blonde" text tile',
    '"MAX B FREE" text tile',
  ],
  anime: [
    'akira manga panels by katsuhiro otomo',
    'spirited away screenshots',
    'japanese horror manga art',
    'futuristic motorcycle concept art',
  ],
  fashion: [
    'comme des garçons issue 9',
    'ugg pillow boots',
    'fashion week runway shots',
    'streetwear lookbook photos',
  ],
  film: [
    'david lynch wild at heart poster',
    'steve jobs video embed',
    'criterion-tier film stills',
  ],
  design: [
    'brutalist architecture interior shots',
    '130+ curated tiles on a dark minimal canvas',
    'midnight dark theme with blurred wallpaper',
  ],
  identity: [
    'it\'s like a visual diary with music',
    'curated page with images + spotify on a dark canvas',
    'way better than a linktree',
  ],
  culture: [
    'white tiger close-up photography',
    'personal screen recordings mixed with editorial photos',
    'the whole page feels like someone\'s camera roll but curated',
  ],
}

// ─── Platform tone guide ────────────────────────────────

const PLATFORM_TONE: Record<Platform, string> = {
  reddit: 'casual, conversational, like talking to friends. lowercase ok. use "tbh", "ngl", "lowkey" naturally. never sound corporate.',
  twitter: 'punchy, concise, max 280 chars. can be fragmented. period for emphasis. lowercase.',
  youtube: 'slightly more enthusiastic but still genuine. can be 2-3 sentences. express real appreciation for the video topic.',
}

// ─── Comment generation via Claude Haiku ────────────────

function buildPrompt(input: PostpackInput): string {
  const { target } = input

  // Find which content categories match this thread
  const threadText = `${target.thread_title} ${target.thread_snippet} ${target.context}`.toLowerCase()
  const relevantContent: string[] = []

  for (const [category, tiles] of Object.entries(ae_CONTENT)) {
    const keywords = {
      sports: ['jordan', 'mj', 'basketball', 'nba', 'dunk', 'bulls', 'goat'],
      music: ['mac miller', 'frank ocean', 'album', 'playlist', 'spotify', 'song', 'track', 'hip hop', 'rap'],
      anime: ['akira', 'anime', 'manga', 'ghibli', 'otomo', 'spirited away', 'miyazaki'],
      fashion: ['streetwear', 'fashion', 'comme des garcons', 'cdg', 'sneakers', 'fits', 'ugg', 'runway'],
      film: ['lynch', 'cinema', 'film', 'criterion', 'a24', 'movie', 'director'],
      design: ['minimal', 'brutalist', 'web design', 'portfolio', 'architecture', 'design'],
      identity: ['linktree', 'personal page', 'bio link', 'link in bio', 'about me', 'digital identity'],
      culture: ['aesthetic', 'curated', 'internet', 'cool', 'taste', 'vibe'],
    }[category] || []

    if (keywords.some(kw => threadText.includes(kw))) {
      relevantContent.push(...tiles)
    }
  }

  // If no specific match, use generic content references
  if (relevantContent.length === 0) {
    relevantContent.push(
      ...ae_CONTENT.culture,
      ...ae_CONTENT.identity
    )
  }

  const tone = PLATFORM_TONE[target.platform] || PLATFORM_TONE.reddit

  return `You are a person who has a beautiful internet page at ${input.room_url}.
Your page has 130+ tiles: MJ dunking, Akira, Mac Miller, David Lynch,
Comme des Garçons, anime, fashion, brutalist architecture, and more.
It's a curated visual diary with a Spotify embed on a dark canvas.

You're commenting on this thread:
Platform: ${target.platform}
Thread title: ${target.thread_title}
Thread content: ${target.thread_snippet || '(no body text)'}
Subreddit/context: ${target.context}

Relevant tiles on your page that connect to this thread:
${relevantContent.map(c => `- ${c}`).join('\n')}

Tone: ${tone}

Write a short, natural comment that:
- Is genuinely relevant to what's being discussed
- Mentions your footprint page naturally (not as an ad)
- References a specific tile that connects to the thread topic
- Sounds like a real person, not a brand
- Is 1-3 sentences max
- Includes "${input.room_url}" naturally

Examples of GOOD comments:
- "mj was different. i have that exact dunk photo on my page ${input.room_url}"
- "the akira influence on everything is crazy. had to put otomo on my footprint"
- "mac miller mirror is so underrated. plays on my page while you scroll through everything ${input.room_url}"

Examples of BAD comments (never do this):
- "Check out my cool new website!"
- "Buy a footprint for only $10!"
- "Hey everyone, I made this product..."

Output ONLY the comment text. Nothing else.`
}

export async function generateComment(input: PostpackInput): Promise<PostpackOutput> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY required for postpack')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Haiku API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  const commentText = data.content?.[0]?.text?.trim()

  if (!commentText) {
    throw new Error('Empty response from Haiku')
  }

  return {
    comment_text: commentText,
    platform: input.target.platform,
    target_url: input.target.thread_url,
    thread_title: input.target.thread_title,
    context: input.target.context,
    metadata: {
      room_url: input.room_url,
      generated_at: new Date().toISOString(),
      model: 'claude-haiku-4-5-20251001',
    },
  }
}

// ─── Batch generation ───────────────────────────────────

export async function generateComments(
  targets: ScanTarget[],
  roomUrl: string
): Promise<PostpackOutput[]> {
  const results: PostpackOutput[] = []

  for (const target of targets) {
    try {
      const output = await generateComment({ room_url: roomUrl, target })
      results.push(output)
      console.log(`  [postpack] ${target.platform} | ${target.context} | "${output.comment_text.slice(0, 60)}..."`)
    } catch (err: any) {
      console.error(`  [postpack] failed for ${target.thread_url}: ${err.message}`)
    }

    // Small delay between Haiku calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 200))
  }

  return results
}
