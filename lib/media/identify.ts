/**
 * FOOTPRINT — Media Identity Orchestrator
 *
 * identifyMedia(url)     → async full resolution
 * identifyMediaSync(url) → sync detection only (no network)
 *
 * Composition:
 *   detectProvider → canonicalizeUrl → provider adapter → fallback ladder
 *
 * The fallback ladder guarantees:
 *   preferred renderMode → preview_card → link_only
 *   Never fail closed.
 */

import { detectProvider } from './detectProvider'
import { canonicalizeUrl } from './canonicalize'
import { resolveProvider } from './providers'
import { PROVIDER_RENDER_DEFAULTS, contentTypeToKind } from './types'
import type { IdentifiedMedia, MediaProvider, RenderMode } from './types'

// ── Default shell ──────────────────────────────────────────

function emptyMedia(url: string, provider: MediaProvider): IdentifiedMedia {
  return {
    kind: 'link',
    provider,
    canonicalUrl: url,
    title: 'Link',
    subtitle: null,
    authorName: null,
    thumbnailUrl: null,
    posterUrl: null,
    embedHtml: null,
    embedUrl: null,
    playbackUrl: null,
    durationMs: null,
    aspectRatio: null,
    renderMode: 'link_only',
    connectionRequired: false,
    rawMetadata: {},
  }
}

// ── Async full resolution ──────────────────────────────────

export async function identifyMedia(url: string): Promise<IdentifiedMedia> {
  if (!url || !url.trim()) {
    return emptyMedia('', 'generic')
  }

  // Ensure URL has protocol
  let cleaned = url.trim()
  if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned

  const provider = detectProvider(cleaned)
  const canonical = canonicalizeUrl(cleaned, provider)

  // Start with empty shell
  const base = emptyMedia(canonical, provider)

  // Run provider adapter
  let adapterResult: Partial<IdentifiedMedia>
  try {
    adapterResult = await resolveProvider(canonical, provider)
  } catch {
    adapterResult = {}
  }

  // Merge adapter result onto base
  const merged: IdentifiedMedia = {
    ...base,
    ...stripUndefined(adapterResult),
    canonicalUrl: canonical,
  }

  // Apply fallback ladder
  merged.renderMode = applyFallbackLadder(merged)

  return merged
}

// ── Sync detection (no network) ────────────────────────────

export function identifyMediaSync(url: string): IdentifiedMedia | null {
  if (!url || !url.trim()) return null

  let cleaned = url.trim()
  if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned

  const provider = detectProvider(cleaned)
  const canonical = canonicalizeUrl(cleaned, provider)
  const defaults = PROVIDER_RENDER_DEFAULTS[provider] || PROVIDER_RENDER_DEFAULTS.generic

  const kind = providerToKind(provider)
  const renderMode = kind === 'link' ? 'link_only' as const : defaults.preferredMode

  return {
    kind,
    provider,
    canonicalUrl: canonical,
    title: providerTitle(provider),
    subtitle: null,
    authorName: null,
    thumbnailUrl: null,
    posterUrl: null,
    embedHtml: null,
    embedUrl: null,
    playbackUrl: null,
    durationMs: null,
    aspectRatio: null,
    renderMode,
    connectionRequired: false,
    rawMetadata: {},
  }
}

// ── Fallback ladder ────────────────────────────────────────

function applyFallbackLadder(media: IdentifiedMedia): RenderMode {
  const current = media.renderMode

  // If embed mode but no embed data, fall to preview_card
  if (current === 'embed' && !media.embedUrl && !media.embedHtml) {
    if (media.thumbnailUrl) return 'preview_card'
    return 'link_only'
  }

  // If preview_card but no title and no thumbnail, fall to link_only
  if (current === 'preview_card' && !media.thumbnailUrl && media.title === 'Link') {
    return 'link_only'
  }

  return current
}

// ── Helpers ────────────────────────────────────────────────

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

function providerToKind(provider: MediaProvider): IdentifiedMedia['kind'] {
  switch (provider) {
    case 'youtube': case 'vimeo': case 'uploaded_video': return 'video'
    case 'spotify': case 'soundcloud': case 'apple_music': case 'bandcamp': return 'music'
    case 'tiktok': case 'instagram': case 'x': return 'social'
    default: return 'link'
  }
}

function providerTitle(provider: MediaProvider): string {
  const titles: Record<string, string> = {
    youtube: 'YouTube Video',
    spotify: 'Spotify',
    soundcloud: 'SoundCloud',
    vimeo: 'Vimeo Video',
    bandcamp: 'Bandcamp',
    apple_music: 'Apple Music',
    tiktok: 'TikTok Video',
    instagram: 'Instagram Post',
    x: 'Post',
  }
  return titles[provider] || 'Link'
}
