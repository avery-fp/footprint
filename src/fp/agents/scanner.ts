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
  { name: 'nfl', categories: ['sports'] },
  { name: 'sports', categories: ['sports'] },
  // Music
  { name: 'hiphopheads', categories: ['music'] },
  { name: 'MacMiller', categories: ['music'] },
  { name: 'FrankOcean', categories: ['music'] },
  { name: 'spotify', categories: ['music'] },
  { name: 'musicproduction', categories: ['music'] },
  { name: 'music', categories: ['music'] },
  { name: 'listentothis', categories: ['music'] },
  { name: 'rnb', categories: ['music'] },
  { name: 'indieheads', categories: ['music'] },
  // Fashion
  { name: 'streetwear', categories: ['fashion'] },
  { name: 'malefashion', categories: ['fashion'] },
  { name: 'sneakers', categories: ['fashion'] },
  { name: 'fashionreps', categories: ['fashion'] },
  { name: 'rawdenim', categories: ['fashion'] },
  { name: 'womensstreetwear', categories: ['fashion'] },
  // Anime
  { name: 'anime', categories: ['anime'] },
  { name: 'manga', categories: ['anime'] },
  { name: 'animeart', categories: ['anime'] },
  { name: 'OnePiece', categories: ['anime'] },
  { name: 'JuJutsuKaisen', categories: ['anime'] },
  // Film
  { name: 'movies', categories: ['film'] },
  { name: 'criterion', categories: ['film'] },
  { name: 'TrueFilm', categories: ['film'] },
  { name: 'davidlynch', categories: ['film'] },
  { name: 'A24', categories: ['film'] },
  { name: 'filmmakers', categories: ['film', 'design'] },
  { name: 'Letterboxd', categories: ['film'] },
  { name: 'CineShots', categories: ['film', 'culture'] },
  // Design & Tech
  { name: 'web_design', categories: ['design', 'identity'] },
  { name: 'design', categories: ['design'] },
  { name: 'InternetIsBeautiful', categories: ['design', 'identity'] },
  { name: 'minimalism', categories: ['design'] },
  { name: 'architecture', categories: ['design'] },
  { name: 'battlestations', categories: ['design', 'culture'] },
  { name: 'mechanicalkeyboards', categories: ['design', 'culture'] },
  { name: 'graphic_design', categories: ['design'] },
  { name: 'UI_Design', categories: ['design', 'identity'] },
  // Photography & Visual
  { name: 'photography', categories: ['culture', 'design'] },
  { name: 'analog', categories: ['culture', 'design'] },
  { name: 'itookapicture', categories: ['culture'] },
  { name: 'PixelArt', categories: ['culture', 'anime'] },
  // Culture
  { name: 'internetculture', categories: ['culture'] },
  { name: 'aesthetics', categories: ['culture'] },
  { name: 'vaporwave', categories: ['culture'] },
  { name: 'Art', categories: ['culture'] },
  { name: 'outrun', categories: ['culture'] },
  { name: 'RetroFuturism', categories: ['culture'] },
  { name: 'CozyPlaces', categories: ['culture'] },
  // Tech / Side Projects
  { name: 'SideProject', categories: ['identity', 'design'] },
  { name: 'webdev', categories: ['design', 'identity'] },
  { name: 'IndieHackers', categories: ['identity'] },
  { name: 'startups', categories: ['identity'] },
  { name: 'Entrepreneur', categories: ['identity'] },
  { name: 'selfhosted', categories: ['identity', 'design'] },
  { name: 'programming', categories: ['identity'] },
  // General (high traffic)
  { name: 'pics', categories: ['culture'] },
  { name: 'interestingasfuck', categories: ['culture'] },
  { name: 'nextfuckinglevel', categories: ['culture'] },
  { name: 'coolguides', categories: ['culture'] },
  { name: 'oddlysatisfying', categories: ['culture'] },
  { name: 'mildlyinteresting', categories: ['culture'] },
]

// ─── Stable Surfaces ──────────────────────────────────
//
// If the hot scan returns 0 targets, fall back to these
// evergreen high-traffic threads so the engine always has work.

const STABLE_SURFACES: ScanTarget[] = [
  {
    platform: 'reddit',
    thread_id: 'stable-sideproject',
    thread_url: 'https://www.reddit.com/r/SideProject/comments/top/',
    thread_title: 'Share your side projects',
    thread_snippet: 'Weekly thread for sharing side projects and getting feedback.',
    context: 'r/SideProject',
    score: 40,
    engagement: { upvotes: 50, comments: 100 },
  },
  {
    platform: 'reddit',
    thread_id: 'stable-webdev',
    thread_url: 'https://www.reddit.com/r/webdev/comments/top/',
    thread_title: 'Showoff Saturday',
    thread_snippet: 'Share what you built this week.',
    context: 'r/webdev',
    score: 40,
    engagement: { upvotes: 30, comments: 80 },
  },
  {
    platform: 'reddit',
    thread_id: 'stable-internetisbeautiful',
    thread_url: 'https://www.reddit.com/r/InternetIsBeautiful/comments/top/',
    thread_title: 'Cool sites and web projects',
    thread_snippet: 'Discover interesting and beautiful websites.',
    context: 'r/InternetIsBeautiful',
    score: 45,
    engagement: { upvotes: 100, comments: 50 },
  },
  {
    platform: 'reddit',
    thread_id: 'stable-design',
    thread_url: 'https://www.reddit.com/r/design/comments/top/',
    thread_title: 'Design inspiration and critique',
    thread_snippet: 'Share and discuss design work.',
    context: 'r/design',
    score: 35,
    engagement: { upvotes: 40, comments: 60 },
  },
  {
    platform: 'reddit',
    thread_id: 'stable-indiehackers',
    thread_url: 'https://www.reddit.com/r/IndieHackers/comments/top/',
    thread_title: 'What are you working on?',
    thread_snippet: 'Monthly thread for indie projects and launches.',
    context: 'r/IndieHackers',
    score: 40,
    engagement: { upvotes: 25, comments: 70 },
  },
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

    const twentyFourHoursAgo = (Date.now() / 1000) - (24 * 60 * 60)

    return posts
      .filter(p => {
        const d = p.data
        // Skip NSFW, stickied, and low-engagement threads
        if (d.over_18 || d.stickied) return false
        // Only threads from the last 24 hours
        if (d.created_utc < twentyFourHoursAgo) return false
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

export async function scanReddit(limit: number = 50): Promise<ScanTarget[]> {
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

  const sorted = deduped
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  // Always-on fallback: if hot scan found nothing, use stable surfaces
  if (sorted.length === 0) {
    console.log(`  [scanner] 0 hot targets — falling back to ${STABLE_SURFACES.length} stable surfaces`)
    return STABLE_SURFACES
  }

  return sorted
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
