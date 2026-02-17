/**
 * SOCIAL POST AGENT — posts to X (with media) and generates IG copy.
 *
 * Twitter/X flow:
 *   1. Upload og.png via media/upload (v1.1 chunked)
 *   2. Post tweet: "{handle}\nfootprint.onl/{slug}\n#{serial}" + media_id
 *   3. If no keys: save to ignition-output/{slug}/x-post.txt
 *
 * Instagram flow:
 *   IG API is restrictive. We generate the post file:
 *   ignition-output/{slug}/ig-post.txt with caption, tag, image path.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createHmac } from 'crypto'

// ─── Types ──────────────────────────────────────────────

export interface SocialPostInput {
  slug: string
  serial: number
  room_url: string
  twitter_handle: string
  instagram_handle: string
  screenshot_dir: string
  screenshot_files: Record<string, string>
}

export interface SocialPostResult {
  platform: 'twitter' | 'instagram'
  status: 'posted' | 'saved' | 'failed'
  file_path?: string
  tweet_id?: string
  error?: string
}

// ─── Twitter OAuth 1.0a ─────────────────────────────────

function oauthParams(consumerKey: string, accessToken: string): Record<string, string> {
  return {
    oauth_consumer_key: consumerKey,
    oauth_nonce: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }
}

function oauthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const base = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sorted),
  ].join('&')

  const key = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`
  return createHmac('sha1', key).update(base).digest('base64')
}

function oauthHeader(params: Record<string, string>): string {
  return 'OAuth ' + Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ')
}

// ─── Twitter media upload (v1.1) ────────────────────────

async function uploadMedia(
  imagePath: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessSecret: string
): Promise<string | null> {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')

  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json'

  // Simple upload (base64) — works for images under 5MB
  const bodyParams: Record<string, string> = {
    media_data: base64,
  }

  const params = oauthParams(apiKey, accessToken)
  // For form-encoded body, include body params in signature
  const allParams = { ...params, ...bodyParams }
  params.oauth_signature = oauthSignature('POST', uploadUrl, allParams, apiSecret, accessSecret)

  const body = new URLSearchParams(bodyParams).toString()

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': oauthHeader(params),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`    [social] media upload failed: ${response.status} ${text.slice(0, 200)}`)
    return null
  }

  const data = await response.json()
  return data.media_id_string || null
}

// ─── Twitter post ───────────────────────────────────────

async function postToTwitter(input: SocialPostInput): Promise<SocialPostResult> {
  const apiKey = process.env.TWITTER_API_KEY
  const apiSecret = process.env.TWITTER_API_SECRET
  const accessToken = process.env.TWITTER_ACCESS_TOKEN
  const accessSecret = process.env.TWITTER_ACCESS_SECRET

  const tweetText = `${input.twitter_handle}\n${input.room_url}\n#${input.serial}`

  // No keys → save to file
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return saveTwitterPost(input, tweetText)
  }

  try {
    // Upload og.png as media
    let mediaId: string | null = null
    const ogPath = input.screenshot_files['og']
    if (ogPath && existsSync(ogPath)) {
      console.log(`    [social] uploading og.png to Twitter...`)
      mediaId = await uploadMedia(ogPath, apiKey, apiSecret, accessToken, accessSecret)
    }

    // Post tweet via v2
    const tweetUrl = 'https://api.twitter.com/2/tweets'
    const tweetBody: Record<string, any> = { text: tweetText }
    if (mediaId) {
      tweetBody.media = { media_ids: [mediaId] }
    }

    const params = oauthParams(apiKey, accessToken)
    params.oauth_signature = oauthSignature('POST', tweetUrl, params, apiSecret, accessSecret)

    const response = await fetch(tweetUrl, {
      method: 'POST',
      headers: {
        'Authorization': oauthHeader(params),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`    [social] tweet failed: ${response.status} ${text.slice(0, 200)}`)
      // Save to file as fallback
      return saveTwitterPost(input, tweetText, `API error: ${response.status}`)
    }

    const data = await response.json()
    const tweetId = data.data?.id

    console.log(`    [social] tweeted: ${tweetId}`)
    return { platform: 'twitter', status: 'posted', tweet_id: tweetId }
  } catch (err: any) {
    console.error(`    [social] tweet error: ${err.message}`)
    return saveTwitterPost(input, tweetText, err.message)
  }
}

function saveTwitterPost(input: SocialPostInput, text: string, error?: string): SocialPostResult {
  const filePath = resolve(input.screenshot_dir, 'x-post.txt')
  const content = [
    `── X POST ──────────────────────────────`,
    ``,
    text,
    ``,
    `── MEDIA ───────────────────────────────`,
    `Attach: ${input.screenshot_files['og'] || 'og.png (not captured)'}`,
    ``,
    error ? `── NOTE: ${error} ──` : `── Ready to copy/paste ──`,
  ].join('\n')

  writeFileSync(filePath, content, 'utf-8')
  console.log(`    [social] X post saved → x-post.txt`)
  return { platform: 'twitter', status: 'saved', file_path: filePath }
}

// ─── Instagram post generation ──────────────────────────

function generateInstagramPost(input: SocialPostInput): SocialPostResult {
  const caption = `${input.room_url} #${input.serial}`
  const tag = input.instagram_handle
  const imagePath = input.screenshot_files['square'] || 'square.png (not captured)'

  const filePath = resolve(input.screenshot_dir, 'ig-post.txt')
  const content = [
    `── IG POST ─────────────────────────────`,
    ``,
    `Caption: ${caption}`,
    `Tag: ${tag}`,
    `Image: ${imagePath}`,
    ``,
    `── Ready to post manually ──`,
  ].join('\n')

  writeFileSync(filePath, content, 'utf-8')
  console.log(`    [social] IG post saved → ig-post.txt`)
  return { platform: 'instagram', status: 'saved', file_path: filePath }
}

// ─── Main: post everywhere ──────────────────────────────

export async function postSocial(
  input: SocialPostInput,
  opts: { dry_run?: boolean } = {}
): Promise<SocialPostResult[]> {
  const results: SocialPostResult[] = []

  // Twitter/X
  if (input.twitter_handle) {
    if (opts.dry_run) {
      // Save to file instead of posting
      const text = `${input.twitter_handle}\n${input.room_url}\n#${input.serial}`
      results.push(saveTwitterPost(input, text, 'DRY RUN'))
    } else {
      results.push(await postToTwitter(input))
    }
  }

  // Instagram (always saves to file — API is restrictive)
  if (input.instagram_handle) {
    results.push(generateInstagramPost(input))
  }

  return results
}
