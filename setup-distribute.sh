#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════
# FOOTPRINT DISTRIBUTION PIPELINE — setup script
# Creates all 5 new files + patches cli.ts and package.json
#
# Usage: bash setup-distribute.sh
# Run from the footprint project root (where package.json is)
# ═══════════════════════════════════════════════════════════

echo "Setting up footprint distribution pipeline..."

# Verify we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src/fp" ]; then
  echo "ERROR: Run this from the footprint project root (where package.json is)"
  exit 1
fi

mkdir -p src/fp/agents src/fp/pipeline

# ─── FILE 1: src/fp/agents/scanner.ts ────────────────────
echo "  [1/7] Creating scanner.ts..."
cat > src/fp/agents/scanner.ts << 'SCANNER_EOF'
/**
 * SCANNER AGENT — finds deployment targets across platforms.
 *
 * Scans Reddit, Twitter, and YouTube for threads/posts where a
 * footprint comment would be relevant and well-received.
 *
 * Reddit reading requires NO authentication — GET /r/{sub}/hot.json
 * works without any keys. Twitter and YouTube need API keys.
 *
 * Returns scored ScanTarget[] sorted by relevance.
 */

// ─── Types ──────────────────────────────────────────────

export type Platform = 'reddit' | 'twitter' | 'youtube'

export interface ScanTarget {
  platform: Platform
  thread_id: string
  thread_url: string
  thread_title: string
  thread_snippet: string
  context: string // subreddit, hashtag, channel name
  score: number // relevance score 0-100
  engagement: { upvotes?: number; comments?: number; likes?: number; views?: number }
}

export interface ScanOptions {
  platforms?: Platform[]
  limit?: number // max targets per platform
  room_url?: string
}

// ─── Keyword map ────────────────────────────────────────
//
// Maps content categories to keywords that signal relevance.
// A thread matching these is one where a footprint.onl/ae comment
// would feel natural, not forced.

const KEYWORD_MAP: Record<string, string[]> = {
  sports: ['jordan', 'mj', 'basketball', 'nba', 'dunk', 'all-star', 'bulls', 'goat debate'],
  music: ['mac miller', 'frank ocean', 'hip hop', 'album', 'playlist', 'mirror mac', 'blonde', 'endless', 'mase'],
  fashion: ['streetwear', 'comme des garcons', 'fashion week', 'fits', 'ugg', 'runway', 'cdg'],
  anime: ['akira', 'anime', 'manga', 'studio ghibli', 'otomo', 'spirited away', 'miyazaki'],
  film: ['lynch', 'david lynch', 'criterion', 'cinema', 'film', 'a24', 'wild at heart'],
  design: ['minimal', 'brutalist', 'web design', 'personal site', 'portfolio', 'architecture'],
  identity: ['linktree', 'personal page', 'internet presence', 'link in bio', 'digital identity', 'about me page'],
  culture: ['aesthetic', 'curated', 'vaporwave', 'internet culture', 'cool finds', 'taste'],
}

// Flatten all keywords for quick matching
const ALL_KEYWORDS = Object.values(KEYWORD_MAP).flat()

// ─── Subreddit config ───────────────────────────────────

interface SubredditConfig {
  name: string
  categories: string[]
}

const SUBREDDITS: SubredditConfig[] = [
  // Sports
  { name: 'nba', categories: ['sports'] },
  { name: 'basketball', categories: ['sports'] },
  { name: 'chicagobulls', categories: ['sports'] },
  { name: 'nbadiscussion', categories: ['sports'] },
  // Music
  { name: 'hiphopheads', categories: ['music'] },
  { name: 'MacMiller', categories: ['music'] },
  { name: 'FrankOcean', categories: ['music'] },
  { name: 'spotify', categories: ['music'] },
  { name: 'musicproduction', categories: ['music'] },
  // Fashion
  { name: 'streetwear', categories: ['fashion'] },
  { name: 'malefashion', categories: ['fashion'] },
  { name: 'sneakers', categories: ['fashion'] },
  { name: 'fashionreps', categories: ['fashion'] },
  // Anime
  { name: 'anime', categories: ['anime'] },
  { name: 'manga', categories: ['anime'] },
  { name: 'animeart', categories: ['anime'] },
  // Film
  { name: 'movies', categories: ['film'] },
  { name: 'criterion', categories: ['film'] },
  { name: 'TrueFilm', categories: ['film'] },
  { name: 'davidlynch', categories: ['film'] },
  { name: 'A24', categories: ['film'] },
  // Design
  { name: 'web_design', categories: ['design', 'identity'] },
  { name: 'design', categories: ['design'] },
  { name: 'InternetIsBeautiful', categories: ['design', 'identity'] },
  { name: 'minimalism', categories: ['design'] },
  { name: 'architecture', categories: ['design'] },
  // Culture
  { name: 'internetculture', categories: ['culture'] },
  { name: 'aesthetics', categories: ['culture'] },
  { name: 'vaporwave', categories: ['culture'] },
  { name: 'Art', categories: ['culture'] },
  // Tech / Side Projects
  { name: 'SideProject', categories: ['identity', 'design'] },
  { name: 'webdev', categories: ['design', 'identity'] },
  { name: 'IndieHackers', categories: ['identity'] },
  { name: 'startups', categories: ['identity'] },
  { name: 'Entrepreneur', categories: ['identity'] },
  // General (high traffic)
  { name: 'pics', categories: ['culture'] },
  { name: 'interestingasfuck', categories: ['culture'] },
  { name: 'nextfuckinglevel', categories: ['culture'] },
  { name: 'coolguides', categories: ['culture'] },
]

// ─── Reddit scanner (no auth required for reading) ──────

interface RedditPost {
  data: {
    id: string
    title: string
    selftext: string
    subreddit: string
    permalink: string
    score: number
    num_comments: number
    created_utc: number
    over_18: boolean
    stickied: boolean
    link_flair_text?: string
  }
}

function scoreThread(title: string, body: string, subredditCategories: string[], engagement: number): number {
  const text = `${title} ${body}`.toLowerCase()
  let score = 0

  // Keyword matches (up to 50 points)
  for (const category of subredditCategories) {
    const keywords = KEYWORD_MAP[category] || []
    for (const kw of keywords) {
      if (text.includes(kw)) {
        score += 10
      }
    }
  }
  score = Math.min(score, 50)

  // Engagement bonus (up to 30 points)
  if (engagement > 100) score += 30
  else if (engagement > 50) score += 20
  else if (engagement > 10) score += 10

  // Identity/design keywords are especially relevant (bonus)
  const identityKeywords = KEYWORD_MAP.identity || []
  for (const kw of identityKeywords) {
    if (text.includes(kw)) {
      score += 15
      break
    }
  }

  // Penalty: too many comments = buried
  // (handled by caller filtering)

  return Math.min(score, 100)
}

async function scanSubreddit(
  config: SubredditConfig,
  mode: 'hot' | 'rising' = 'hot',
  limit: number = 25
): Promise<ScanTarget[]> {
  const url = `https://www.reddit.com/r/${config.name}/${mode}.json?limit=${limit}&raw_json=1`

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'footprint-scanner/1.0' },
    })

    if (!response.ok) {
      if (response.status === 429) {
        console.log(`  [scanner] Reddit rate limited on r/${config.name}, skipping`)
      } else {
        console.error(`  [scanner] Reddit r/${config.name} failed: ${response.status}`)
      }
      return []
    }

    const data = await response.json()
    const posts: RedditPost[] = data?.data?.children || []

    return posts
      .filter(p => {
        const d = p.data
        // Skip NSFW, stickied, and low-engagement threads
        if (d.over_18 || d.stickied) return false
        // Want active threads (>10 upvotes) but not mega-threads (>500 comments = buried)
        if (d.score < 10 || d.num_comments > 500) return false
        return true
      })
      .map(p => {
        const d = p.data
        const relevance = scoreThread(d.title, d.selftext, config.categories, d.score)
        return {
          platform: 'reddit' as Platform,
          thread_id: d.id,
          thread_url: `https://www.reddit.com${d.permalink}`,
          thread_title: d.title,
          thread_snippet: (d.selftext || '').slice(0, 300),
          context: `r/${d.subreddit}`,
          score: relevance,
          engagement: { upvotes: d.score, comments: d.num_comments },
        }
      })
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
  } catch (err) {
    console.error(`  [scanner] Reddit r/${config.name} error:`, err)
    return []
  }
}

async function scanReddit(limit: number = 50): Promise<ScanTarget[]> {
  console.log(`  [scanner] scanning ${SUBREDDITS.length} subreddits...`)

  // Scan subreddits in batches of 5 to avoid hammering Reddit
  const allTargets: ScanTarget[] = []
  const batchSize = 5

  for (let i = 0; i < SUBREDDITS.length; i += batchSize) {
    const batch = SUBREDDITS.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(sub => scanSubreddit(sub, 'hot', 25))
    )
    for (const targets of results) {
      allTargets.push(...targets)
    }

    // Small delay between batches to be polite
    if (i + batchSize < SUBREDDITS.length) {
      await sleep(1000)
    }
  }

  // Also scan rising threads from high-priority subs
  const prioritySubs = SUBREDDITS.filter(s =>
    s.categories.includes('identity') || s.categories.includes('design')
  )
  const risingResults = await Promise.all(
    prioritySubs.slice(0, 5).map(sub => scanSubreddit(sub, 'rising', 10))
  )
  for (const targets of risingResults) {
    allTargets.push(...targets)
  }

  // Dedupe by thread_id, sort by score, take top N
  const seen = new Set<string>()
  const deduped = allTargets.filter(t => {
    if (seen.has(t.thread_id)) return false
    seen.add(t.thread_id)
    return true
  })

  return deduped
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// ─── Twitter scanner (requires bearer token) ────────────

async function scanTwitter(limit: number = 20): Promise<ScanTarget[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  if (!bearerToken) {
    console.log(`  [scanner] Twitter: no TWITTER_BEARER_TOKEN, skipping`)
    return []
  }

  const queries = [
    'personal website aesthetic',
    'linktree alternative',
    'internet identity',
    'digital identity page',
    'curated page aesthetic',
    'michael jordan goat',
    'mac miller mirror',
    'akira manga',
    'frank ocean blonde',
    'streetwear fits',
  ]

  const allTargets: ScanTarget[] = []

  for (const query of queries.slice(0, 5)) {
    try {
      const params = new URLSearchParams({
        query: `${query} -is:retweet lang:en`,
        max_results: '10',
        'tweet.fields': 'public_metrics,created_at',
      })

      const response = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?${params}`,
        { headers: { 'Authorization': `Bearer ${bearerToken}` } }
      )

      if (!response.ok) {
        if (response.status === 429) {
          console.log(`  [scanner] Twitter rate limited, stopping`)
          break
        }
        continue
      }

      const data = await response.json()
      const tweets = data.data || []

      for (const tweet of tweets) {
        const metrics = tweet.public_metrics || {}
        if ((metrics.like_count || 0) < 10) continue

        allTargets.push({
          platform: 'twitter',
          thread_id: tweet.id,
          thread_url: `https://twitter.com/i/status/${tweet.id}`,
          thread_title: tweet.text.slice(0, 100),
          thread_snippet: tweet.text,
          context: query,
          score: Math.min((metrics.like_count || 0) / 2, 50) + 20,
          engagement: {
            likes: metrics.like_count,
            comments: metrics.reply_count,
          },
        })
      }

      await sleep(1000) // respect rate limits
    } catch (err) {
      console.error(`  [scanner] Twitter error for "${query}":`, err)
    }
  }

  return allTargets
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// ─── YouTube scanner (requires API key) ─────────────────

async function scanYouTube(limit: number = 10): Promise<ScanTarget[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.log(`  [scanner] YouTube: no YOUTUBE_API_KEY, skipping`)
    return []
  }

  const queries = [
    'michael jordan highlights',
    'akira analysis',
    'mac miller mirror',
    'streetwear lookbook',
    'personal website design',
    'david lynch filmmaking',
  ]

  const allTargets: ScanTarget[] = []

  for (const query of queries.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        key: apiKey,
        q: query,
        part: 'snippet',
        type: 'video',
        maxResults: '5',
        order: 'date',
        publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params}`
      )

      if (!response.ok) continue

      const data = await response.json()
      const items = data.items || []

      for (const item of items) {
        const snippet = item.snippet || {}
        const videoId = item.id?.videoId
        if (!videoId) continue

        allTargets.push({
          platform: 'youtube',
          thread_id: videoId,
          thread_url: `https://www.youtube.com/watch?v=${videoId}`,
          thread_title: snippet.title || '',
          thread_snippet: (snippet.description || '').slice(0, 300),
          context: snippet.channelTitle || query,
          score: 30, // YouTube gets a flat score — engagement data needs extra API call
          engagement: {},
        })
      }

      await sleep(500)
    } catch (err) {
      console.error(`  [scanner] YouTube error for "${query}":`, err)
    }
  }

  return allTargets.slice(0, limit)
}

// ─── Main: scan all platforms ───────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function scan(opts: ScanOptions = {}): Promise<ScanTarget[]> {
  const platforms = opts.platforms || ['reddit', 'twitter', 'youtube']
  const limit = opts.limit || 50

  console.log(`\n  [scanner] starting scan across ${platforms.join(', ')}`)
  const allTargets: ScanTarget[] = []

  // Run each platform scanner
  if (platforms.includes('reddit')) {
    const redditTargets = await scanReddit(limit)
    console.log(`  [scanner] Reddit: ${redditTargets.length} targets found`)
    allTargets.push(...redditTargets)
  }

  if (platforms.includes('twitter')) {
    const twitterTargets = await scanTwitter(Math.min(limit, 20))
    console.log(`  [scanner] Twitter: ${twitterTargets.length} targets found`)
    allTargets.push(...twitterTargets)
  }

  if (platforms.includes('youtube')) {
    const youtubeTargets = await scanYouTube(Math.min(limit, 10))
    console.log(`  [scanner] YouTube: ${youtubeTargets.length} targets found`)
    allTargets.push(...youtubeTargets)
  }

  // Sort all by score, return top N
  const sorted = allTargets
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  console.log(`  [scanner] total: ${sorted.length} deployment targets`)
  return sorted
}
SCANNER_EOF

# ─── FILE 2: src/fp/agents/postpack.ts ──────────────────
echo "  [2/7] Creating postpack.ts..."
cat > src/fp/agents/postpack.ts << 'POSTPACK_EOF'
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
POSTPACK_EOF

# ─── FILE 3: src/fp/agents/deploy-log.ts ────────────────
echo "  [3/7] Creating deploy-log.ts..."
cat > src/fp/agents/deploy-log.ts << 'DEPLOYLOG_EOF'
/**
 * DEPLOY LOG — tracks every deployment action.
 *
 * Logs to:
 *   1. Local JSON files: deploy-log/{date}.json (always works)
 *   2. Supabase table: aro_deploy_log (if SUPABASE keys available)
 *
 * Every comment posted, every failure, every rate limit — all logged.
 * This feeds into Darwin later for optimization.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Types ──────────────────────────────────────────────

export type DeployStatus = 'posted' | 'failed' | 'rate_limited' | 'queued' | 'dry_run'

export interface DeployLogEntry {
  id: string
  timestamp: string
  platform: string
  target_url: string
  comment_text: string
  room_url: string
  status: DeployStatus
  error?: string
  engagement?: { upvotes?: number; likes?: number; replies?: number }
}

// ─── ID generation ──────────────────────────────────────

function generateId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `dl_${timestamp}_${random}`
}

// ─── Local file logging ─────────────────────────────────

const LOG_DIR = resolve(process.cwd(), 'deploy-log')

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return resolve(LOG_DIR, `${date}.json`)
}

function readLogFile(path: string): DeployLogEntry[] {
  if (!existsSync(path)) return []
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

function writeLogFile(path: string, entries: DeployLogEntry[]): void {
  writeFileSync(path, JSON.stringify(entries, null, 2), 'utf-8')
}

// ─── Supabase logging (optional) ────────────────────────

async function logToSupabase(entry: DeployLogEntry): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) return

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/aro_deploy_log`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: entry.id,
        timestamp: entry.timestamp,
        platform: entry.platform,
        target_url: entry.target_url,
        comment_text: entry.comment_text,
        room_url: entry.room_url,
        status: entry.status,
        error: entry.error || null,
        engagement: entry.engagement || null,
      }),
    })

    if (!response.ok) {
      // Supabase logging is best-effort, don't fail the pipeline
      console.error(`  [deploy-log] Supabase insert failed: ${response.status}`)
    }
  } catch {
    // Silently ignore Supabase errors — local log is the source of truth
  }
}

// ─── Public API ─────────────────────────────────────────

export async function log(entry: Omit<DeployLogEntry, 'id' | 'timestamp'>): Promise<DeployLogEntry> {
  const fullEntry: DeployLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    ...entry,
  }

  // Always log locally
  ensureLogDir()
  const logFile = getLogFile()
  const existing = readLogFile(logFile)
  existing.push(fullEntry)
  writeLogFile(logFile, existing)

  // Best-effort Supabase insert
  await logToSupabase(fullEntry)

  return fullEntry
}

export function getTodaysLog(): DeployLogEntry[] {
  ensureLogDir()
  return readLogFile(getLogFile())
}

export function getStats(): { total: number; posted: number; failed: number; by_platform: Record<string, number> } {
  const entries = getTodaysLog()
  const stats = {
    total: entries.length,
    posted: entries.filter(e => e.status === 'posted').length,
    failed: entries.filter(e => e.status === 'failed').length,
    by_platform: {} as Record<string, number>,
  }

  for (const entry of entries) {
    stats.by_platform[entry.platform] = (stats.by_platform[entry.platform] || 0) + 1
  }

  return stats
}
DEPLOYLOG_EOF

# ─── FILE 4: src/fp/agents/deploy.ts ────────────────────
echo "  [4/7] Creating deploy.ts..."
cat > src/fp/agents/deploy.ts << 'DEPLOY_EOF'
/**
 * DEPLOY AGENT — places content across the internet.
 *
 * Platform adapters with built-in rate limiting:
 *   - Reddit: OAuth2 script app, 1 action per 2 seconds
 *   - Twitter: API v2, respects rate limits
 *   - YouTube: OAuth for commenting (fallback: save to queue)
 *   - Generic: saves to deploy-queue/ for manual posting
 *
 * Graceful degradation: if platform keys are missing, skip that
 * platform and fall back to the generic queue adapter.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { log as deployLog } from './deploy-log.js'
import type { PostpackOutput } from './postpack.js'
import type { Platform } from './scanner.js'

// ─── Types ──────────────────────────────────────────────

export interface DeployResult {
  platform: Platform | 'manual'
  target_url: string
  status: 'posted' | 'failed' | 'rate_limited' | 'queued' | 'dry_run'
  error?: string
}

export interface DeployOptions {
  dry_run?: boolean
  platforms?: Platform[]
}

// ─── Rate limiter ───────────────────────────────────────

const lastAction: Record<string, number> = {}

async function rateLimit(platform: string, minIntervalMs: number): Promise<void> {
  const last = lastAction[platform] || 0
  const elapsed = Date.now() - last
  if (elapsed < minIntervalMs) {
    await sleep(minIntervalMs - elapsed)
  }
  lastAction[platform] = Date.now()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Reddit adapter ─────────────────────────────────────

let redditToken: { token: string; expires: number } | null = null

async function redditAuth(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  const username = process.env.REDDIT_USERNAME
  const password = process.env.REDDIT_PASSWORD

  if (!clientId || !clientSecret || !username || !password) {
    return null
  }

  // Reuse token if still valid
  if (redditToken && Date.now() < redditToken.expires) {
    return redditToken.token
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'footprint-deploy/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    }).toString(),
  })

  if (!response.ok) {
    console.error(`  [deploy] Reddit auth failed: ${response.status}`)
    return null
  }

  const data = await response.json()
  redditToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }
  return redditToken.token
}

async function deployRedditComment(output: PostpackOutput): Promise<DeployResult> {
  const token = await redditAuth()

  if (!token) {
    // No Reddit keys — fall back to queue
    return deployToQueue(output)
  }

  await rateLimit('reddit', 2000) // 1 action per 2 seconds

  // Extract thread fullname from URL
  // Reddit URLs: /r/{sub}/comments/{id}/...
  const match = output.target_url.match(/\/comments\/(\w+)/)
  if (!match) {
    return { platform: 'reddit', target_url: output.target_url, status: 'failed', error: 'Cannot extract thread ID' }
  }

  const thingId = `t3_${match[1]}`

  try {
    const response = await fetch('https://oauth.reddit.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'footprint-deploy/1.0',
      },
      body: new URLSearchParams({
        thing_id: thingId,
        text: output.comment_text,
      }).toString(),
    })

    if (response.status === 429) {
      console.log(`  [deploy] Reddit rate limited, will retry next cycle`)
      return { platform: 'reddit', target_url: output.target_url, status: 'rate_limited' }
    }

    if (response.status === 403) {
      console.log(`  [deploy] Reddit 403 on ${output.context} — banned or restricted, skipping`)
      return { platform: 'reddit', target_url: output.target_url, status: 'failed', error: 'Forbidden (403)' }
    }

    if (!response.ok) {
      const text = await response.text()
      return { platform: 'reddit', target_url: output.target_url, status: 'failed', error: `${response.status}: ${text.slice(0, 200)}` }
    }

    return { platform: 'reddit', target_url: output.target_url, status: 'posted' }
  } catch (err: any) {
    return { platform: 'reddit', target_url: output.target_url, status: 'failed', error: err.message }
  }
}

// ─── Twitter adapter ────────────────────────────────────

async function deployTweet(output: PostpackOutput): Promise<DeployResult> {
  const apiKey = process.env.TWITTER_API_KEY
  const apiSecret = process.env.TWITTER_API_SECRET
  const accessToken = process.env.TWITTER_ACCESS_TOKEN
  const accessSecret = process.env.TWITTER_ACCESS_SECRET

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return deployToQueue(output)
  }

  await rateLimit('twitter', 3000)

  // Twitter API v2 requires OAuth 1.0a for posting
  // We use the simple bearer token approach for replies
  try {
    // Extract tweet ID for replies
    const tweetIdMatch = output.target_url.match(/status\/(\d+)/)
    const body: Record<string, any> = { text: output.comment_text }
    if (tweetIdMatch) {
      body.reply = { in_reply_to_tweet_id: tweetIdMatch[1] }
    }

    // OAuth 1.0a signature generation
    const oauthParams = generateOAuthParams(apiKey, accessToken)
    const signature = generateOAuthSignature(
      'POST',
      'https://api.twitter.com/2/tweets',
      oauthParams,
      apiSecret,
      accessSecret
    )
    oauthParams.oauth_signature = signature

    const authHeader = 'OAuth ' + Object.entries(oauthParams)
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ')

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.status === 429) {
      return { platform: 'twitter', target_url: output.target_url, status: 'rate_limited' }
    }

    if (!response.ok) {
      const text = await response.text()
      return { platform: 'twitter', target_url: output.target_url, status: 'failed', error: `${response.status}: ${text.slice(0, 200)}` }
    }

    return { platform: 'twitter', target_url: output.target_url, status: 'posted' }
  } catch (err: any) {
    return { platform: 'twitter', target_url: output.target_url, status: 'failed', error: err.message }
  }
}

// OAuth 1.0a helpers for Twitter

function generateOAuthParams(consumerKey: string, accessToken: string): Record<string, string> {
  return {
    oauth_consumer_key: consumerKey,
    oauth_nonce: Math.random().toString(36).slice(2),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&')

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`

  // Use Node.js crypto for HMAC-SHA1
  const { createHmac } = require('crypto')
  return createHmac('sha1', signingKey).update(baseString).digest('base64')
}

// ─── YouTube adapter ────────────────────────────────────

async function deployYouTubeComment(output: PostpackOutput): Promise<DeployResult> {
  const oauthToken = process.env.YOUTUBE_OAUTH_TOKEN
  if (!oauthToken) {
    // No OAuth = can't comment, save to queue for manual posting
    return deployToQueue(output)
  }

  await rateLimit('youtube', 5000)

  // Extract video ID
  const videoIdMatch = output.target_url.match(/[?&]v=([^&]+)/)
  if (!videoIdMatch) {
    return { platform: 'youtube', target_url: output.target_url, status: 'failed', error: 'Cannot extract video ID' }
  }

  try {
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            videoId: videoIdMatch[1],
            topLevelComment: {
              snippet: {
                textOriginal: output.comment_text,
              },
            },
          },
        }),
      }
    )

    if (response.status === 429) {
      return { platform: 'youtube', target_url: output.target_url, status: 'rate_limited' }
    }

    if (!response.ok) {
      const text = await response.text()
      return { platform: 'youtube', target_url: output.target_url, status: 'failed', error: `${response.status}: ${text.slice(0, 200)}` }
    }

    return { platform: 'youtube', target_url: output.target_url, status: 'posted' }
  } catch (err: any) {
    return { platform: 'youtube', target_url: output.target_url, status: 'failed', error: err.message }
  }
}

// ─── Generic queue adapter ──────────────────────────────
//
// For platforms without API keys or without API access at all
// (Discord, HN, TikTok, Pinterest, forums).
// Saves comment to deploy-queue/{platform}/{timestamp}.json
// for manual posting or browser automation.

const QUEUE_DIR = resolve(process.cwd(), 'deploy-queue')

function deployToQueue(output: PostpackOutput): DeployResult {
  const platformDir = resolve(QUEUE_DIR, output.platform)
  if (!existsSync(platformDir)) {
    mkdirSync(platformDir, { recursive: true })
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`
  const filepath = resolve(platformDir, filename)

  writeFileSync(filepath, JSON.stringify({
    comment_text: output.comment_text,
    target_url: output.target_url,
    thread_title: output.thread_title,
    context: output.context,
    room_url: output.metadata.room_url,
    generated_at: output.metadata.generated_at,
  }, null, 2), 'utf-8')

  return { platform: 'manual', target_url: output.target_url, status: 'queued' }
}

// ─── Main deploy function ───────────────────────────────

export async function deploy(
  comments: PostpackOutput[],
  opts: DeployOptions = {}
): Promise<DeployResult[]> {
  const results: DeployResult[] = []

  // Per-cycle limits
  const limits: Record<string, number> = { reddit: 10, twitter: 5, youtube: 3 }
  const counts: Record<string, number> = { reddit: 0, twitter: 0, youtube: 0 }

  for (const comment of comments) {
    const platform = comment.platform

    // Check per-cycle limit
    if ((counts[platform] || 0) >= (limits[platform] || Infinity)) {
      console.log(`  [deploy] ${platform} limit reached (${limits[platform]}/cycle), queuing remaining`)
      const queueResult = deployToQueue(comment)
      results.push(queueResult)
      await deployLog({
        platform: comment.platform,
        target_url: comment.target_url,
        comment_text: comment.comment_text,
        room_url: comment.metadata.room_url,
        status: 'queued',
      })
      continue
    }

    // Dry run — don't post, just log
    if (opts.dry_run) {
      console.log(`  [deploy] DRY RUN | ${platform} | ${comment.context}`)
      console.log(`           "${comment.comment_text}"`)
      console.log(`           → ${comment.target_url}`)
      console.log()

      const queueResult = deployToQueue(comment)
      results.push({ ...queueResult, status: 'dry_run' })
      await deployLog({
        platform: comment.platform,
        target_url: comment.target_url,
        comment_text: comment.comment_text,
        room_url: comment.metadata.room_url,
        status: 'dry_run',
      })
      continue
    }

    // Actually deploy
    let result: DeployResult

    switch (platform) {
      case 'reddit':
        result = await deployRedditComment(comment)
        break
      case 'twitter':
        result = await deployTweet(comment)
        break
      case 'youtube':
        result = await deployYouTubeComment(comment)
        break
      default:
        result = deployToQueue(comment)
    }

    counts[platform] = (counts[platform] || 0) + 1
    results.push(result)

    // Log every action
    await deployLog({
      platform: comment.platform,
      target_url: comment.target_url,
      comment_text: comment.comment_text,
      room_url: comment.metadata.room_url,
      status: result.status,
      error: result.error,
    })

    const icon = result.status === 'posted' ? '+' : result.status === 'queued' ? '~' : 'x'
    console.log(`  [deploy] ${icon} ${platform} | ${result.status} | ${comment.context}`)
  }

  return results
}
DEPLOY_EOF

# ─── FILE 5: src/fp/pipeline/distribute.ts ──────────────
echo "  [5/7] Creating distribute.ts..."
cat > src/fp/pipeline/distribute.ts << 'DISTRIBUTE_EOF'
/**
 * DISTRIBUTION PIPELINE — the continuous loop.
 *
 * scan → generate → deploy → log → wait → repeat
 *
 * Modes:
 *   npm run fp:distribute              — continuous (runs forever)
 *   npm run fp:distribute -- --once    — single cycle then exit
 *   npm run fp:distribute -- --dry-run — generate but don't post
 *   npm run fp:distribute -- --room footprint.onl/ae
 *   npm run fp:distribute -- --platforms reddit,twitter
 *
 * The machine breathes. Every 60 seconds it scans, generates, deploys.
 */

import { scan } from '../agents/scanner.js'
import { generateComments } from '../agents/postpack.js'
import { deploy } from '../agents/deploy.js'
import { getStats } from '../agents/deploy-log.js'
import type { Platform } from '../agents/scanner.js'

// ─── Types ──────────────────────────────────────────────

export interface DistributeOptions {
  once?: boolean
  dry_run?: boolean
  room_url?: string
  platforms?: Platform[]
  cycle_interval?: number // ms between cycles (default 60s)
}

// ─── Single cycle ───────────────────────────────────────

async function runCycle(opts: DistributeOptions, cycleNumber: number): Promise<void> {
  const roomUrl = opts.room_url || 'footprint.onl/ae'
  const platforms = opts.platforms || ['reddit', 'twitter', 'youtube']

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  CYCLE #${cycleNumber} | ${new Date().toISOString()}`)
  console.log(`  room: ${roomUrl}`)
  console.log(`  platforms: ${platforms.join(', ')}`)
  console.log(`  mode: ${opts.dry_run ? 'DRY RUN' : 'LIVE'}`)
  console.log(`${'─'.repeat(50)}`)

  // 1. SCAN — find deployment targets
  console.log(`\n  [1/3] SCANNING...`)
  const targets = await scan({ platforms, limit: 50 })

  if (targets.length === 0) {
    console.log(`  [scanner] no relevant targets found this cycle`)
    return
  }

  // 2. GENERATE — create contextual comments via Haiku
  console.log(`\n  [2/3] GENERATING comments for ${targets.length} targets...`)
  const comments = await generateComments(targets, roomUrl)

  if (comments.length === 0) {
    console.log(`  [postpack] no comments generated this cycle`)
    return
  }

  // 3. DEPLOY — post comments across platforms
  console.log(`\n  [3/3] DEPLOYING ${comments.length} comments...`)
  const results = await deploy(comments, { dry_run: opts.dry_run, platforms })

  // Cycle summary
  const posted = results.filter(r => r.status === 'posted').length
  const queued = results.filter(r => r.status === 'queued').length
  const failed = results.filter(r => r.status === 'failed').length
  const rateLimited = results.filter(r => r.status === 'rate_limited').length
  const dryRun = results.filter(r => r.status === 'dry_run').length

  console.log(`\n  CYCLE #${cycleNumber} COMPLETE`)
  console.log(`  targets: ${targets.length} | comments: ${comments.length}`)

  if (opts.dry_run) {
    console.log(`  dry run: ${dryRun} | queued: ${queued}`)
  } else {
    console.log(`  posted: ${posted} | queued: ${queued} | failed: ${failed} | rate_limited: ${rateLimited}`)
  }

  // Daily stats
  const stats = getStats()
  console.log(`  today total: ${stats.total} actions (${stats.posted} posted)`)
}

// ─── Main loop ──────────────────────────────────────────

export async function distribute(opts: DistributeOptions = {}): Promise<void> {
  const cycleInterval = opts.cycle_interval || 60_000 // 60 seconds

  console.log(`
╔══════════════════════════════════════════╗
║       FOOTPRINT DISTRIBUTION ENGINE      ║
║        scan → generate → deploy          ║
╚══════════════════════════════════════════╝
`)

  console.log(`  Room: ${opts.room_url || 'footprint.onl/ae'}`)
  console.log(`  Mode: ${opts.once ? 'SINGLE CYCLE' : 'CONTINUOUS'}${opts.dry_run ? ' (DRY RUN)' : ''}`)
  console.log(`  Platforms: ${(opts.platforms || ['reddit', 'twitter', 'youtube']).join(', ')}`)
  console.log(`  Cycle interval: ${cycleInterval / 1000}s`)

  // Check which platform keys are available
  const available: string[] = []
  const missing: string[] = []

  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    available.push('Reddit (post)')
  } else {
    missing.push('Reddit (post) — REDDIT_CLIENT_ID/SECRET missing')
  }
  // Reddit read always works — no auth needed
  available.push('Reddit (scan)')

  if (process.env.TWITTER_BEARER_TOKEN) available.push('Twitter (scan)')
  else missing.push('Twitter (scan) — TWITTER_BEARER_TOKEN missing')
  if (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN) available.push('Twitter (post)')
  else missing.push('Twitter (post) — TWITTER_API_KEY/ACCESS_TOKEN missing')

  if (process.env.YOUTUBE_API_KEY) available.push('YouTube (scan)')
  else missing.push('YouTube (scan) — YOUTUBE_API_KEY missing')
  if (process.env.YOUTUBE_OAUTH_TOKEN) available.push('YouTube (post)')
  else missing.push('YouTube (post) — YOUTUBE_OAUTH_TOKEN missing')

  if (process.env.ANTHROPIC_API_KEY) available.push('Haiku (comments)')
  else missing.push('Haiku (comments) — ANTHROPIC_API_KEY missing')

  console.log(`\n  Available: ${available.join(', ')}`)
  if (missing.length) {
    console.log(`  Missing: ${missing.join(', ')}`)
    console.log(`  (missing platforms will queue comments for manual posting)`)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`\n  ANTHROPIC_API_KEY is required for comment generation. Exiting.`)
    process.exit(1)
  }

  // Single cycle mode
  if (opts.once) {
    await runCycle(opts, 1)
    return
  }

  // Continuous mode — run forever
  let cycle = 0

  // Handle graceful shutdown
  let running = true
  const shutdown = () => {
    console.log(`\n  [distribute] shutting down gracefully...`)
    running = false
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  while (running) {
    cycle++
    try {
      await runCycle(opts, cycle)
    } catch (err: any) {
      console.error(`\n  [distribute] cycle ${cycle} failed: ${err.message}`)
      // Don't crash the loop on individual cycle failures
    }

    if (!running) break

    console.log(`\n  [distribute] sleeping ${cycleInterval / 1000}s until next cycle...`)
    await sleep(cycleInterval)
  }

  const stats = getStats()
  console.log(`\n  FINAL STATS: ${stats.total} total actions, ${stats.posted} posted`)
  console.log(`  Platform breakdown: ${JSON.stringify(stats.by_platform)}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
DISTRIBUTE_EOF

# ─── FILE 6: src/fp/cli.ts (FULL REWRITE) ───────────────
echo "  [6/7] Patching cli.ts..."
cat > src/fp/cli.ts << 'CLI_EOF'
/**
 * CLI driver — the actual logic behind culture.mjs.
 */

import { validateEnv } from './env.js'
import { runPipeline, mintSingle } from './pipeline/autoMint.js'
import { distribute } from './pipeline/distribute.js'
import type { Platform } from './agents/scanner.js'

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {
    mode: 'auto',
    count: 5,
    noun: '',
    dry_run: false,
    skip_screenshots: false,
    skip_deploy: false,
    once: false,
    room: '',
    platforms: '',
  }

  if (args[0] && !args[0].startsWith('--')) {
    parsed.mode = args[0]
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--count':
        parsed.count = parseInt(args[++i], 10) || 5
        break
      case '--noun':
        parsed.noun = args[++i] || ''
        break
      case '--dry-run':
        parsed.dry_run = true
        break
      case '--skip-screenshots':
        parsed.skip_screenshots = true
        break
      case '--skip-deploy':
        parsed.skip_deploy = true
        break
      case '--mode':
        parsed.mode = args[++i] || 'auto'
        break
      case '--once':
        parsed.once = true
        break
      case '--room':
        parsed.room = args[++i] || ''
        break
      case '--platforms':
        parsed.platforms = args[++i] || ''
        break
    }
  }

  return parsed
}

export async function main() {
  const args = parseArgs()

  // Distribute mode has its own env validation (only needs ANTHROPIC_API_KEY)
  if (args.mode === 'distribute') {
    console.log(`
╔══════════════════════════════════════════╗
║         FOOTPRINT CULTURE ENGINE         ║
║     autonomous distribution pipeline     ║
╚══════════════════════════════════════════╝
`)

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('✗ ANTHROPIC_API_KEY required for distribution')
      process.exit(1)
    }

    const platforms = args.platforms
      ? args.platforms.split(',').map(p => p.trim()) as Platform[]
      : undefined

    await distribute({
      once: args.once,
      dry_run: args.dry_run,
      room_url: args.room || undefined,
      platforms,
    })
    return
  }

  console.log(`
╔══════════════════════════════════════════╗
║         FOOTPRINT CULTURE ENGINE         ║
║     autonomous distribution pipeline     ║
╚══════════════════════════════════════════╝
`)

  try {
    validateEnv()
  } catch (err: any) {
    console.error(`\n✗ ${err.message}`)
    console.error('\nRequired env vars:')
    console.error('  UNSPLASH_ACCESS_KEY, BING_API_KEY')
    console.error('  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET')
    console.error('  ANTHROPIC_API_KEY, ARO_KEY')
    console.error('\nOptional:')
    console.error('  FP_BASE_URL (default: https://footprint.onl)')
    console.error('  GOOGLE_API_KEY, GOOGLE_CX (for moment/event image search)')
    console.error('  REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET (for distribution)')
    console.error('  TWITTER_BEARER_TOKEN, TWITTER_API_KEY (for distribution)')
    console.error('  YOUTUBE_API_KEY, YOUTUBE_OAUTH_TOKEN (for distribution)')
    process.exit(1)
  }

  const startTime = Date.now()

  switch (args.mode) {
    case 'mint': {
      if (!args.noun) {
        console.error('✗ --noun required for mint mode')
        console.error('  Usage: npm run fp:mint -- --noun "topic"')
        process.exit(1)
      }
      console.log(`Mode: SINGLE MINT`)
      console.log(`Noun: "${args.noun}"`)
      console.log()

      const result = await mintSingle(args.noun, {
        dry_run: args.dry_run,
        skip_screenshots: args.skip_screenshots,
        skip_deploy: args.skip_deploy,
      })

      if (result.error) {
        console.error(`\n✗ Failed: ${result.error}`)
        process.exit(1)
      }

      if (result.mint) {
        console.log(`\n✓ Minted: ${result.mint.room_url}`)
        console.log(`  Serial: #${result.mint.serial_number}`)
        console.log(`  Tiles: ${result.mint.tile_count}`)
      }
      break
    }

    case 'batch':
    case 'auto': {
      await runPipeline({
        mode: args.mode as 'auto' | 'batch',
        count: args.count,
        dry_run: args.dry_run,
      })
      break
    }

    default:
      console.error(`✗ Unknown mode: "${args.mode}"`)
      console.error('  Available: mint, distribute')
      console.error('  Coming soon: auto, batch, darwin')
      process.exit(1)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone in ${elapsed}s`)
}
CLI_EOF

# ─── FILE 7: package.json (patch — add fp:distribute) ───
echo "  [7/7] Patching package.json..."
# Use node to safely patch JSON
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
pkg.scripts["fp:distribute"] = "npx tsx src/fp/culture.mjs distribute";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'

# ─── .gitignore (add deploy-log/ and deploy-queue/) ─────
if ! grep -q "deploy-log/" .gitignore 2>/dev/null; then
  echo "" >> .gitignore
  echo "# Distribution pipeline output" >> .gitignore
  echo "deploy-log/" >> .gitignore
  echo "deploy-queue/" >> .gitignore
fi

echo ""
echo "Done. Distribution pipeline installed."
echo ""
echo "  Files created:"
echo "    src/fp/agents/scanner.ts"
echo "    src/fp/agents/postpack.ts"
echo "    src/fp/agents/deploy-log.ts"
echo "    src/fp/agents/deploy.ts"
echo "    src/fp/pipeline/distribute.ts"
echo ""
echo "  Files patched:"
echo "    src/fp/cli.ts"
echo "    package.json"
echo "    .gitignore"
echo ""
echo "  Test it:"
echo "    npm run fp:distribute -- --dry-run --once"
echo ""
