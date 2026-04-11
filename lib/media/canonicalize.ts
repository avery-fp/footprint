/**
 * FOOTPRINT — URL Canonicalization
 *
 * canonicalizeUrl(url, provider) → cleaned canonical URL
 *
 * Provider-specific normalization:
 * - YouTube: all formats → youtube.com/watch?v=ID
 * - Twitter/X: twitter.com → x.com
 * - Spotify: strip tracking params
 * - Apple Music: strip tracking, preserve ?i= track ID
 * - Generic: strip UTM, trailing slash, ensure https
 */

import type { MediaProvider } from './types'

const UTM_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'si', 's', 't', 'ref', 'fbclid', 'gclid', 'ls', 'app',
])

function stripTrackingParams(url: string, keepParams?: Set<string>): string {
  try {
    const u = new URL(url)
    const keepers = new URLSearchParams()
    u.searchParams.forEach((val, key) => {
      if (keepParams?.has(key)) {
        keepers.set(key, val)
      } else if (!UTM_PARAMS.has(key)) {
        keepers.set(key, val)
      }
    })
    const qs = keepers.toString()
    return u.origin + u.pathname + (qs ? '?' + qs : '')
  } catch {
    return url
  }
}

function canonicalizeYouTube(url: string): string {
  // Extract video ID from any YouTube URL format
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  )
  if (!m) return stripTrackingParams(url)
  return `https://www.youtube.com/watch?v=${m[1]}`
}

function canonicalizeTwitter(url: string): string {
  // Normalize twitter.com → x.com, strip tracking
  const cleaned = stripTrackingParams(url)
  return cleaned.replace(/https?:\/\/(www\.)?twitter\.com/i, 'https://x.com')
}

function canonicalizeSpotify(url: string): string {
  return stripTrackingParams(url)
}

function canonicalizeAppleMusic(url: string): string {
  // Keep ?i= (specific track in album) but strip everything else
  return stripTrackingParams(url, new Set(['i']))
}

function canonicalizeGeneric(url: string): string {
  let cleaned = stripTrackingParams(url)
  // Ensure https
  cleaned = cleaned.replace(/^http:\/\//i, 'https://')
  // Strip trailing slash (but not root path)
  if (cleaned.endsWith('/') && new URL(cleaned).pathname !== '/') {
    cleaned = cleaned.slice(0, -1)
  }
  return cleaned
}

export function canonicalizeUrl(url: string, provider: MediaProvider): string {
  switch (provider) {
    case 'youtube':     return canonicalizeYouTube(url)
    case 'x':           return canonicalizeTwitter(url)
    case 'spotify':     return canonicalizeSpotify(url)
    case 'apple_music': return canonicalizeAppleMusic(url)
    default:            return canonicalizeGeneric(url)
  }
}
