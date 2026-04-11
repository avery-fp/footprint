/**
 * FOOTPRINT — Provider Detection
 *
 * detectProvider(url) → MediaProvider
 *
 * Simple URL pattern matching. Intentionally maintains its own regex set
 * (separate from parser.ts) to keep parser.ts frozen while the new
 * identity system evolves independently.
 */

import type { MediaProvider } from './types'

export function detectProvider(url: string): MediaProvider {
  if (!url) return 'generic'
  const u = url.toLowerCase()

  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x'
  if (u.includes('spotify.com')) return 'spotify'
  if (u.includes('music.apple.com')) return 'apple_music'
  if (u.includes('soundcloud.com')) return 'soundcloud'
  if (u.includes('vimeo.com')) return 'vimeo'
  if (u.includes('bandcamp.com')) return 'bandcamp'

  return 'generic'
}
