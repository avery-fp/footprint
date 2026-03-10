/**
 * POSTPACK AGENT — generates contextual comments for each platform.
 *
 * Fetches top comments from the target thread to match the thread's
 * actual energy, then generates comments that blend in naturally.
 *
 * Distribution:
 *   40% — include footprint.onl/ae as casual aside
 *   10% — mystery drop ("footprint.onl" or "footprint.onl iykyk")
 *   50% — pure value, zero link, builds account credibility
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
    comment_type: 'value' | 'casual_link' | 'mystery_drop'
  }
}

// ─── Room content library ───────────────────────────────

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

// ─── Fetch top comments from thread ─────────────────────

interface ThreadComment {
  body: string
  score: number
  author: string
}

async function fetchTopComments(target: ScanTarget): Promise<ThreadComment[]> {
  if (target.platform !== 'reddit') return []

  // Extract subreddit and thread id from URL
  // Format: https://www.reddit.com/r/{sub}/comments/{id}/...
  const match = target.thread_url.match(/\/r\/([^/]+)\/comments\/([^/]+)/)
  if (!match) return []

  const [, sub, id] = match
  const url = `https://www.reddit.com/r/${sub}/comments/${id}.json?sort=top&limit=5`

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'footprint-postpack/1.0' },
    })

    if (!response.ok) return []

    const data = await response.json()
    // Reddit returns [post, comments] — comments are in data[1]
    const commentListing = data?.[1]?.data?.children || []

    return commentListing
      .filter((c: any) => c.kind === 't1' && c.data?.body)
      .slice(0, 3)
      .map((c: any) => ({
        body: c.data.body.slice(0, 300),
        score: c.data.score || 0,
        author: c.data.author || '',
      }))
  } catch {
    return []
  }
}

// ─── Pick comment type by distribution ──────────────────

type CommentType = 'value' | 'casual_link' | 'mystery_drop'

function pickCommentType(): CommentType {
  const roll = Math.random()
  if (roll < 0.50) return 'value'
  if (roll < 0.90) return 'casual_link'
  return 'mystery_drop'
}

// ─── Comment generation via Claude Haiku ────────────────

const BANNED_WORDS = [
  'ngl', 'fire', 'insane', 'absolutely', 'incredible', 'amazing',
  'mind-blowing', 'game-changer', 'next level', 'bussin', 'sheesh',
  'goated', 'slaps', 'hits different', 'no cap',
]

function buildPrompt(input: PostpackInput, topComments: ThreadComment[], commentType: CommentType): string {
  const { target } = input

  // Find which content categories match this thread
  const threadText = `${target.thread_title} ${target.thread_snippet} ${target.context}`.toLowerCase()
  const relevantContent: string[] = []

  for (const [category, tiles] of Object.entries(ae_CONTENT)) {
    const keywords: Record<string, string[]> = {
      sports: ['jordan', 'mj', 'basketball', 'nba', 'dunk', 'bulls', 'goat'],
      music: ['mac miller', 'frank ocean', 'album', 'playlist', 'spotify', 'song', 'track', 'hip hop', 'rap'],
      anime: ['akira', 'anime', 'manga', 'ghibli', 'otomo', 'spirited away', 'miyazaki'],
      fashion: ['streetwear', 'fashion', 'comme des garcons', 'cdg', 'sneakers', 'fits', 'ugg', 'runway'],
      film: ['lynch', 'cinema', 'film', 'criterion', 'a24', 'movie', 'director'],
      design: ['minimal', 'brutalist', 'web design', 'portfolio', 'architecture', 'design'],
      identity: ['linktree', 'personal page', 'bio link', 'link in bio', 'about me', 'digital identity'],
      culture: ['aesthetic', 'curated', 'internet', 'cool', 'taste', 'vibe'],
    }

    const categoryKeywords = keywords[category] || []
    if (categoryKeywords.some(kw => threadText.includes(kw))) {
      relevantContent.push(...tiles)
    }
  }

  if (relevantContent.length === 0) {
    relevantContent.push(...ae_CONTENT.culture, ...ae_CONTENT.identity)
  }

  // Build tone reference from top comments
  const toneSection = topComments.length > 0
    ? `\nHere are the top-voted comments in this thread. Match their energy, length, and style EXACTLY:\n${topComments.map((c, i) => `${i + 1}. (${c.score} upvotes) "${c.body}"`).join('\n')}\n`
    : ''

  // Build type-specific instruction
  let typeInstruction: string
  switch (commentType) {
    case 'mystery_drop':
      return `You are posting a single mysterious comment in a reddit thread.

Thread: r/${target.context} — "${target.thread_title}"
${toneSection}

Output EXACTLY one of these two options (pick randomly):
- footprint.onl
- footprint.onl iykyk

Output ONLY the chosen text. Nothing else.`

    case 'casual_link':
      typeInstruction = `Include "footprint.onl/ae" somewhere in the comment as a casual aside —
like mentioning your own page in passing. It should feel like you're sharing
something personal, not promoting. The link should NOT be the focus of the comment.`
      break

    case 'value':
      typeInstruction = `Do NOT include any links, URLs, or mentions of footprint.
This comment is pure contribution to the discussion. Build credibility by
being genuinely helpful, funny, or insightful about the topic.`
      break
  }

  return `You're a real person commenting on a reddit thread.
You have a page at footprint.onl/ae with 130+ tiles spanning basketball,
music, anime, fashion, film, and architecture.

Thread:
Platform: ${target.platform}
Title: ${target.thread_title}
Body: ${target.thread_snippet || '(no body text)'}
Context: ${target.context}
${toneSection}
Relevant tiles on your page:
${relevantContent.map(c => `- ${c}`).join('\n')}

RULES — follow every single one:
1. Mirror the EXACT energy and style of the top comments above
2. ${typeInstruction}
3. Write in lowercase. no capital letters unless it's a proper noun
4. Never use quotes around your own words
5. Never use these words: ${BANNED_WORDS.join(', ')}
6. Never mention "footprint" as a product or brand name — if linking,
   just drop the url naturally like you'd drop any link
7. 1-2 sentences max. be concise
8. Sound like you belong in this thread. if the thread is shitposty, shitpost.
   if it's serious discussion, be thoughtful
9. Never start with "yo", "bro check this", or any attention-grabbing opener

Output ONLY the comment text. Nothing else.`
}

function sanitizeComment(text: string): string {
  let clean = text.trim()

  // Strip surrounding quotes
  if ((clean.startsWith('"') && clean.endsWith('"')) ||
      (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1)
  }

  // Enforce lowercase (preserve URLs)
  clean = clean.replace(/[^(footprint\.onl\S*)]+/g, (match) => {
    // Don't lowercase URLs
    if (match.includes('http') || match.includes('footprint.onl')) return match
    return match.toLowerCase()
  })

  // Remove banned hype words
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    clean = clean.replace(regex, '').replace(/\s{2,}/g, ' ')
  }

  return clean.trim()
}

export async function generateComment(input: PostpackInput): Promise<PostpackOutput> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY required for postpack')
  }

  // Fetch top comments for tone reference
  const topComments = await fetchTopComments(input.target)

  // Pick comment type by distribution
  const commentType = pickCommentType()

  const prompt = buildPrompt(input, topComments, commentType)

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
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Haiku API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  let commentText = data.content?.[0]?.text?.trim()

  if (!commentText) {
    throw new Error('Empty response from Haiku')
  }

  // Sanitize unless it's a mystery drop (those are exact strings)
  if (commentType !== 'mystery_drop') {
    commentText = sanitizeComment(commentText)
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
      comment_type: commentType,
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
      const typeTag = output.metadata.comment_type === 'value' ? 'val'
        : output.metadata.comment_type === 'casual_link' ? 'link'
        : 'drop'
      console.log(`  [postpack] ${target.platform} | ${target.context} | [${typeTag}] "${output.comment_text.slice(0, 60)}..."`)
      results.push(output)
    } catch (err: any) {
      console.error(`  [postpack] failed for ${target.thread_url}: ${err.message}`)
    }

    // Small delay between calls
    await new Promise(r => setTimeout(r, 300))
  }

  return results
}
