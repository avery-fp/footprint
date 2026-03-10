/**
 * OUTREACH SCANNER — finds high-intent people across platforms.
 *
 * Searches Twitter and Instagram for people who would instantly
 * understand and want Footprint, based on 5 signal types:
 *
 *   1. Nostalgia  — "miss myspace", "old internet", etc.
 *   2. Artist     — digital artists needing a home for their work
 *   3. Collector  — NFT/digital collectible people with no display case
 *   4. Curator    — mood board / aesthetic grid / film still accounts
 *   5. Following  — mid-tier creators from our own following lists
 *
 * Outputs OutreachTarget[] and saves to outreach-targets/{date}.json.
 * Feeds directly into DM and reply lanes.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Types ──────────────────────────────────────────────

export type OutreachPlatform = 'twitter' | 'instagram'

export type SignalType = 'nostalgia' | 'artist' | 'collector' | 'curator' | 'following'

export type ApproachType = 'dm' | 'reply' | 'comment'

export interface OutreachTarget {
  platform: OutreachPlatform
  username: string
  follower_count: number | null
  signal_type: SignalType
  recent_post_text: string
  suggested_approach: ApproachType
  suggested_message: string
  score: number
  scanned_at: string
}

export interface OutreachScanOptions {
  platforms?: OutreachPlatform[]
  signals?: SignalType[]
  limit?: number
  dry_run?: boolean
}

// ─── Search queries by signal type ──────────────────────

const NOSTALGIA_QUERIES = [
  'miss myspace',
  'miss tumblr',
  'tumblr era',
  'old internet',
  'wish I still had my myspace',
  'internet used to be',
  'remember when profiles were',
  'bring back myspace',
]

const ARTIST_QUERIES = [
  'digital art',
  'my art',
  'art portfolio',
  'new pieces',
  'commission open',
]

const COLLECTOR_QUERIES = [
  'nft collection',
  'my collection',
  'digital collectibles',
  'web3 art',
]

const CURATOR_QUERIES = [
  'mood board',
  'aesthetic grid',
  'film stills',
  'music curation',
  'film photography',
  'visual diary',
]

// ─── Following list accounts to scan ────────────────────

interface FollowingAccount {
  platform: OutreachPlatform
  username: string
  source: string // which of our accounts follows them
}

const OUR_ACCOUNTS = {
  instagram: 'opusvisions',
  twitter: '100x_avery',
}

// ─── Message templates by signal type ───────────────────

function generateMessage(signal: SignalType, recentText: string): string {
  const lower = recentText.toLowerCase()

  switch (signal) {
    case 'nostalgia':
      return 'this might scratch that itch — footprint.onl'
    case 'artist':
      // try to reference their work naturally
      if (lower.includes('commission')) return 'your work deserves more than a feed. footprint.onl'
      if (lower.includes('portfolio')) return 'this would go hard as your portfolio — footprint.onl'
      return 'somewhere permanent for all of it — footprint.onl'
    case 'collector':
      return 'finally somewhere to put all of it — footprint.onl'
    case 'curator':
      return 'your grid would go crazy on this — footprint.onl'
    case 'following':
      // casual, like a friend sharing
      if (lower.includes('music') || lower.includes('album') || lower.includes('playlist'))
        return 'thought of you when i saw this — footprint.onl'
      if (lower.includes('film') || lower.includes('cinema') || lower.includes('movie'))
        return 'you would do something insane with this — footprint.onl'
      return 'feel like this is your thing — footprint.onl'
  }
}

function pickApproach(signal: SignalType, followerCount: number | null): ApproachType {
  // Bigger accounts: reply publicly so others see it too.
  // Smaller accounts: DM feels more personal.
  // Curators on IG: comment on their posts.
  const followers = followerCount || 0

  if (signal === 'curator') return 'comment'
  if (signal === 'nostalgia') return 'reply' // reply to their tweet directly
  if (followers > 10000) return 'reply'
  return 'dm'
}

// ─── Helpers ────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function todayString(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Twitter search scanner ─────────────────────────────

interface TwitterUser {
  id: string
  username: string
  public_metrics?: {
    followers_count?: number
    following_count?: number
    tweet_count?: number
  }
}

interface TwitterTweet {
  id: string
  text: string
  author_id: string
  public_metrics?: {
    like_count?: number
    reply_count?: number
    retweet_count?: number
  }
}

async function searchTwitter(
  query: string,
  signal: SignalType,
  bearerToken: string,
  limit: number = 10
): Promise<OutreachTarget[]> {
  const params = new URLSearchParams({
    query: `${query} -is:retweet lang:en`,
    max_results: String(Math.min(limit, 100)),
    'tweet.fields': 'public_metrics,author_id,created_at',
    expansions: 'author_id',
    'user.fields': 'public_metrics,username',
  })

  try {
    const response = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${params}`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    )

    if (!response.ok) {
      if (response.status === 429) {
        console.log(`  [outreach] Twitter rate limited on "${query}", stopping`)
      }
      return []
    }

    const data = await response.json()
    const tweets: TwitterTweet[] = data.data || []
    const users: TwitterUser[] = data.includes?.users || []

    // Build user lookup
    const userMap = new Map<string, TwitterUser>()
    for (const u of users) {
      userMap.set(u.id, u)
    }

    const targets: OutreachTarget[] = []

    for (const tweet of tweets) {
      const user = userMap.get(tweet.author_id)
      if (!user) continue

      const followers = user.public_metrics?.followers_count ?? null

      // For artists, filter 500-50k followers
      if (signal === 'artist' && followers !== null) {
        if (followers < 500 || followers > 50000) continue
      }

      const approach = pickApproach(signal, followers)
      const message = generateMessage(signal, tweet.text)

      targets.push({
        platform: 'twitter',
        username: user.username,
        follower_count: followers,
        signal_type: signal,
        recent_post_text: tweet.text.slice(0, 280),
        suggested_approach: approach,
        suggested_message: message,
        score: scoreTarget(signal, followers, tweet.public_metrics?.like_count ?? 0),
        scanned_at: new Date().toISOString(),
      })
    }

    return targets
  } catch (err) {
    console.error(`  [outreach] Twitter search error for "${query}":`, err)
    return []
  }
}

function scoreTarget(signal: SignalType, followers: number | null, likes: number): number {
  let score = 0

  // Signal type base score
  const signalScores: Record<SignalType, number> = {
    nostalgia: 40,  // highest intent — already expressing desire
    artist: 30,
    collector: 25,
    curator: 20,
    following: 35,  // warm lead — already in our orbit
  }
  score += signalScores[signal]

  // Follower sweet spot: 1k-50k is ideal
  const f = followers || 0
  if (f >= 1000 && f <= 10000) score += 30
  else if (f >= 10000 && f <= 50000) score += 20
  else if (f >= 500 && f < 1000) score += 15
  else if (f > 50000) score += 10

  // Engagement signal
  if (likes > 100) score += 20
  else if (likes > 50) score += 15
  else if (likes > 10) score += 10
  else if (likes > 0) score += 5

  return Math.min(score, 100)
}

// ─── Instagram scanner (via public API) ─────────────────

async function searchInstagram(
  query: string,
  signal: SignalType,
  limit: number = 10
): Promise<OutreachTarget[]> {
  // Instagram hashtag/search discovery via public web endpoints.
  // Requires no auth for basic hashtag pages.
  const tag = query.replace(/\s+/g, '').toLowerCase()
  const url = `https://www.instagram.com/explore/tags/${tag}/?__a=1&__d=dis`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      // IG blocks unauthenticated scraping — graceful skip
      console.log(`  [outreach] Instagram tag "${tag}" returned ${response.status}, skipping`)
      return []
    }

    const data = await response.json()
    const edges = data?.graphql?.hashtag?.edge_hashtag_to_media?.edges || []
    const targets: OutreachTarget[] = []

    for (const edge of edges.slice(0, limit)) {
      const node = edge.node
      if (!node) continue

      const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || ''
      const ownerUsername = node.owner?.username
      if (!ownerUsername) continue

      const approach = pickApproach(signal, null)
      const message = generateMessage(signal, caption)

      targets.push({
        platform: 'instagram',
        username: ownerUsername,
        follower_count: null, // requires profile fetch
        signal_type: signal,
        recent_post_text: caption.slice(0, 280),
        suggested_approach: approach,
        suggested_message: message,
        score: scoreTarget(signal, null, node.edge_liked_by?.count ?? 0),
        scanned_at: new Date().toISOString(),
      })
    }

    return targets
  } catch {
    console.log(`  [outreach] Instagram tag "${tag}" unreachable, skipping`)
    return []
  }
}

// ─── Following list scanner ─────────────────────────────

async function scanFollowingTwitter(
  bearerToken: string,
  limit: number = 50
): Promise<OutreachTarget[]> {
  // Step 1: Resolve our user ID
  const sourceUsername = OUR_ACCOUNTS.twitter
  try {
    const userResp = await fetch(
      `https://api.twitter.com/2/users/by/username/${sourceUsername}?user.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    )
    if (!userResp.ok) {
      console.log(`  [outreach] Could not resolve @${sourceUsername}, skipping following scan`)
      return []
    }

    const userData = await userResp.json()
    const userId = userData.data?.id
    if (!userId) return []

    // Step 2: Get following list
    const params = new URLSearchParams({
      max_results: String(Math.min(limit, 1000)),
      'user.fields': 'public_metrics,username,description',
    })

    const followResp = await fetch(
      `https://api.twitter.com/2/users/${userId}/following?${params}`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    )

    if (!followResp.ok) {
      console.log(`  [outreach] Twitter following list failed: ${followResp.status}`)
      return []
    }

    const followData = await followResp.json()
    const following: TwitterUser[] = followData.data || []

    const targets: OutreachTarget[] = []

    for (const user of following) {
      const followers = user.public_metrics?.followers_count ?? 0

      // Filter: mid-tier creators (1k-100k followers)
      if (followers < 1000 || followers > 100000) continue

      // Skip likely brands/corporate: high following ratio or generic bios
      const followingCount = user.public_metrics?.following_count ?? 0
      if (followingCount > 0 && followers / followingCount > 50) continue // probably a brand

      const bio = (user as TwitterUser & { description?: string }).description || ''
      const approach = pickApproach('following', followers)
      const message = generateMessage('following', bio)

      targets.push({
        platform: 'twitter',
        username: user.username,
        follower_count: followers,
        signal_type: 'following',
        recent_post_text: bio.slice(0, 280),
        suggested_approach: approach,
        suggested_message: message,
        score: scoreTarget('following', followers, 0),
        scanned_at: new Date().toISOString(),
      })
    }

    return targets
  } catch (err) {
    console.error(`  [outreach] Following scan error:`, err)
    return []
  }
}

async function scanFollowingInstagram(
  _limit: number = 50
): Promise<OutreachTarget[]> {
  // Instagram following list requires authenticated session.
  // Log and skip — targets can be imported manually via CSV.
  console.log(
    `  [outreach] Instagram following scan for @${OUR_ACCOUNTS.instagram} requires auth session — ` +
    `export via app and place in input/ig-following.json to include`
  )
  return []
}

// ─── Signal-based scan orchestration ────────────────────

async function scanSignal(
  signal: SignalType,
  platforms: OutreachPlatform[],
  bearerToken: string | undefined,
  limit: number
): Promise<OutreachTarget[]> {
  const targets: OutreachTarget[] = []

  const queries: string[] = {
    nostalgia: NOSTALGIA_QUERIES,
    artist: ARTIST_QUERIES,
    collector: COLLECTOR_QUERIES,
    curator: CURATOR_QUERIES,
    following: [], // handled separately
  }[signal]

  if (signal === 'following') {
    if (platforms.includes('twitter') && bearerToken) {
      const twitterFollowing = await scanFollowingTwitter(bearerToken, limit)
      console.log(`  [outreach] Following (Twitter): ${twitterFollowing.length} targets`)
      targets.push(...twitterFollowing)
    }
    if (platforms.includes('instagram')) {
      const igFollowing = await scanFollowingInstagram(limit)
      targets.push(...igFollowing)
    }
    return targets
  }

  // Search queries — rotate through, 3 per signal max to stay under rate limits
  const selectedQueries = queries.slice(0, 3)

  for (const query of selectedQueries) {
    if (platforms.includes('twitter') && bearerToken) {
      const twitterResults = await searchTwitter(query, signal, bearerToken, Math.ceil(limit / 3))
      targets.push(...twitterResults)
      await sleep(1000)
    }

    if (platforms.includes('instagram')) {
      const igResults = await searchInstagram(query, signal, Math.ceil(limit / 3))
      targets.push(...igResults)
      await sleep(500)
    }
  }

  return targets
}

// ─── Dedupe targets ─────────────────────────────────────

function dedupeTargets(targets: OutreachTarget[]): OutreachTarget[] {
  const seen = new Map<string, OutreachTarget>()

  for (const t of targets) {
    const key = `${t.platform}:${t.username.toLowerCase()}`
    const existing = seen.get(key)

    // Keep the higher-scored entry
    if (!existing || t.score > existing.score) {
      seen.set(key, t)
    }
  }

  return Array.from(seen.values())
}

// ─── Save results ───────────────────────────────────────

function saveTargets(targets: OutreachTarget[], dryRun: boolean): string {
  const dir = resolve(process.cwd(), 'outreach-targets')
  const filename = `${todayString()}.json`
  const filepath = resolve(dir, filename)

  if (dryRun) {
    console.log(`  [outreach] dry run — would save ${targets.length} targets to ${filepath}`)
    return filepath
  }

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(filepath, JSON.stringify(targets, null, 2), 'utf-8')
  console.log(`  [outreach] saved ${targets.length} targets to ${filepath}`)
  return filepath
}

// ─── Main: scan all signals ─────────────────────────────

export async function scanOutreach(opts: OutreachScanOptions = {}): Promise<OutreachTarget[]> {
  const platforms = opts.platforms || ['twitter', 'instagram']
  const signals = opts.signals || ['nostalgia', 'artist', 'collector', 'curator', 'following']
  const limit = opts.limit || 100
  const dryRun = opts.dry_run || false

  const bearerToken = process.env.TWITTER_BEARER_TOKEN

  if (!bearerToken && platforms.includes('twitter')) {
    console.log(`  [outreach] no TWITTER_BEARER_TOKEN — Twitter signals will be skipped`)
  }

  console.log(`\n  [outreach] starting outreach scan`)
  console.log(`  [outreach] platforms: ${platforms.join(', ')}`)
  console.log(`  [outreach] signals: ${signals.join(', ')}`)

  let allTargets: OutreachTarget[] = []

  for (const signal of signals) {
    console.log(`  [outreach] scanning signal: ${signal}`)
    const signalTargets = await scanSignal(signal, platforms, bearerToken, Math.ceil(limit / signals.length))
    console.log(`  [outreach] ${signal}: ${signalTargets.length} raw targets`)
    allTargets.push(...signalTargets)
  }

  // Dedupe across all signals
  allTargets = dedupeTargets(allTargets)

  // Sort by score descending
  allTargets.sort((a, b) => b.score - a.score)

  // Trim to limit
  allTargets = allTargets.slice(0, limit)

  console.log(`  [outreach] total: ${allTargets.length} unique outreach targets`)

  // Save to file
  const filepath = saveTargets(allTargets, dryRun)
  console.log(`  [outreach] output: ${filepath}`)

  return allTargets
}
