/**
 * UNIFIED MEDIA RESOLVER
 *
 * Single entry point for all media resolution.
 * Given any URL → returns a complete ResolvedMedia descriptor.
 *
 * Orchestrates parseEmbed() (embed engine) and parseURL() (content type detection)
 * into one merged shape. Existing files stay intact — this wraps them.
 */

import { parseEmbed, extractYouTubeId, getYouTubeThumbnail } from '@/lib/parseEmbed'
import type { EmbedResult, EmbedPlatform } from '@/lib/parseEmbed'
import { parseURL } from '@/lib/parser'
import type { ContentType } from '@/lib/parser'
import { mediaTypeFromUrl } from '@/lib/media'

// ── Public types ────────────────────────────────────────────

export type MediaType =
  | ContentType
  | EmbedPlatform
  | 'video'

export interface ResolvedMedia {
  /** Canonical content type — drives tile rendering logic */
  type: MediaType
  /** Cleaned / canonical URL */
  canonicalUrl: string
  /** Platform-specific external ID (YouTube video ID, Spotify track ID, etc.) */
  externalId: string | null
  /** Best preview/thumbnail image URL */
  previewImage: string | null
  /** Display title */
  title: string
  /** Optional description */
  description: string | null
  /** Embed iframe URL (if embeddable) */
  embedUrl: string | null
  /** Fixed embed height in px (0 = use aspect ratio) */
  embedHeight: number | null
  /** Embed aspect ratio CSS string e.g. '16/9' */
  embedAspectRatio: string | null
  /** Embed tier: 1 = battle-tested, 2 = best-effort */
  embedTier: 1 | 2 | null
  /** Raw embed HTML from parser (social blockquotes, etc.) */
  embedHtml: string | null
  /** Default aspect preset for grid layout */
  defaultAspect: string
}

// ── Default aspect per media type ───────────────────────────

function defaultAspectForType(type: MediaType): string {
  switch (type) {
    case 'youtube':
    case 'vimeo':
      return 'wide'
    case 'video':
      return 'auto'
    case 'image':
      return 'auto'
    case 'spotify':
    case 'soundcloud':
      return 'square'
    default:
      return 'square'
  }
}

// ── Main resolver ───────────────────────────────────────────

/**
 * Resolve any URL into a complete media descriptor.
 *
 * Fast path: synchronous embed detection via parseEmbed().
 * Slow path: async content parsing via parseURL() (oEmbed fetches, etc.)
 *
 * For client-side use where you need instant feedback, call
 * resolveMediaSync() which only uses the embed engine.
 */
export async function resolveMedia(url: string): Promise<ResolvedMedia> {
  if (!url || !url.trim()) {
    return fallback(url)
  }

  const cleaned = normalizeUrl(url)

  // 1. Try embed engine first (synchronous, no network)
  const embed = parseEmbed(cleaned)

  // 2. Get content type detection + metadata (may fetch oEmbed)
  const parsed = await parseURL(cleaned)

  // 3. Merge results
  if (embed) {
    return mergeEmbedAndParsed(cleaned, embed, parsed)
  }

  // No embed — use parsed result directly
  return fromParsedOnly(cleaned, parsed)
}

/**
 * Synchronous resolve — embed detection only, no network.
 * Use in UI for instant platform icon feedback while typing.
 */
export function resolveMediaSync(url: string): ResolvedMedia | null {
  if (!url || !url.trim()) return null

  const cleaned = normalizeUrl(url)
  const embed = parseEmbed(cleaned)
  if (!embed) {
    // Check if it's a direct media file
    const isVideo = /\.(mp4|mov|webm|m4v)($|\?)/i.test(cleaned)
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(cleaned)
    if (isVideo) {
      return {
        type: 'video',
        canonicalUrl: cleaned,
        externalId: null,
        previewImage: null,
        title: cleaned.split('/').pop()?.split('?')[0] || 'Video',
        description: null,
        embedUrl: null,
        embedHeight: null,
        embedAspectRatio: null,
        embedTier: null,
        embedHtml: null,
        defaultAspect: 'auto',
      }
    }
    if (isImage) {
      return {
        type: 'image',
        canonicalUrl: cleaned,
        externalId: null,
        previewImage: cleaned,
        title: cleaned.split('/').pop()?.split('?')[0] || 'Image',
        description: null,
        embedUrl: null,
        embedHeight: null,
        embedAspectRatio: null,
        embedTier: null,
        embedHtml: null,
        defaultAspect: 'auto',
      }
    }
    return null
  }

  const ytId = embed.platform === 'youtube' ? extractYouTubeId(cleaned) : null

  return {
    type: embed.platform,
    canonicalUrl: cleaned,
    externalId: ytId || extractExternalId(cleaned, embed.platform),
    previewImage: ytId ? getYouTubeThumbnail(cleaned) : null,
    title: platformTitle(embed.platform),
    description: null,
    embedUrl: embed.embedUrl,
    embedHeight: embed.height || null,
    embedAspectRatio: embed.aspectRatio || null,
    embedTier: embed.tier,
    embedHtml: null,
    defaultAspect: defaultAspectForType(embed.platform),
  }
}

// ── Internal helpers ────────────────────────────────────────

function normalizeUrl(url: string): string {
  let u = url.trim()
  if (!u.startsWith('http')) u = 'https://' + u
  return u
}

function fallback(url: string): ResolvedMedia {
  return {
    type: 'link',
    canonicalUrl: url || '',
    externalId: null,
    previewImage: null,
    title: 'Link',
    description: null,
    embedUrl: null,
    embedHeight: null,
    embedAspectRatio: null,
    embedTier: null,
    embedHtml: null,
    defaultAspect: 'square',
  }
}

function mergeEmbedAndParsed(
  url: string,
  embed: EmbedResult,
  parsed: { type: string; external_id: string | null; title: string; description: string | null; thumbnail_url: string | null; embed_html: string | null }
): ResolvedMedia {
  const ytId = embed.platform === 'youtube' ? extractYouTubeId(url) : null

  return {
    type: embed.platform,
    canonicalUrl: url,
    externalId: parsed.external_id || ytId || extractExternalId(url, embed.platform),
    previewImage: parsed.thumbnail_url || (ytId ? getYouTubeThumbnail(url) : null),
    title: parsed.title || platformTitle(embed.platform),
    description: parsed.description,
    embedUrl: embed.embedUrl,
    embedHeight: embed.height || null,
    embedAspectRatio: embed.aspectRatio || null,
    embedTier: embed.tier,
    embedHtml: parsed.embed_html,
    defaultAspect: defaultAspectForType(embed.platform),
  }
}

function fromParsedOnly(
  url: string,
  parsed: { type: string; external_id: string | null; title: string; description: string | null; thumbnail_url: string | null; embed_html: string | null }
): ResolvedMedia {
  // Check if uploaded file is actually a video stored as 'image' type
  const effectiveType = parsed.type === 'image' && mediaTypeFromUrl(url) === 'video'
    ? 'video' as MediaType
    : parsed.type as MediaType

  return {
    type: effectiveType,
    canonicalUrl: url,
    externalId: parsed.external_id,
    previewImage: parsed.thumbnail_url,
    title: parsed.title,
    description: parsed.description,
    embedUrl: null,
    embedHeight: null,
    embedAspectRatio: null,
    embedTier: null,
    embedHtml: parsed.embed_html,
    defaultAspect: defaultAspectForType(effectiveType),
  }
}

function extractExternalId(url: string, platform: string): string | null {
  switch (platform) {
    case 'spotify': {
      const m = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
      return m ? m[2] : null
    }
    case 'vimeo': {
      const m = url.match(/vimeo\.com\/(\d+)/)
      return m ? m[1] : null
    }
    default:
      return null
  }
}

function platformTitle(platform: string): string {
  const titles: Record<string, string> = {
    youtube: 'YouTube Video',
    spotify: 'Spotify',
    soundcloud: 'SoundCloud Track',
    vimeo: 'Vimeo Video',
    bandcamp: 'Bandcamp',
    'google-maps': 'Google Maps',
    codepen: 'CodePen',
    arena: 'Are.na',
    figma: 'Figma',
  }
  return titles[platform] || 'Embed'
}
