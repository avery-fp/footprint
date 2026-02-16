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
