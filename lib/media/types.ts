/**
 * FOOTPRINT IDENTITY INTAKE — Canonical Type System
 *
 * Three orthogonal dimensions:
 *   MediaKind    — what it IS (video, music, social, image, article, link)
 *   MediaProvider — where it's FROM (youtube, spotify, x, apple_music, ...)
 *   RenderMode   — how to SHOW it (native_video, embed, preview_card, link_only)
 *
 * Bridge functions map the legacy ContentType/EmbedPlatform types into this system.
 */

import type { ContentType } from '@/lib/parser'

// ── Core types ─────────────────────────────────────────────

export type MediaKind =
  | 'image'
  | 'video'
  | 'music'
  | 'social'
  | 'article'
  | 'link'

export type MediaProvider =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'spotify'
  | 'apple_music'
  | 'soundcloud'
  | 'vimeo'
  | 'bandcamp'
  | 'github'
  | 'letterboxd'
  | 'uploaded_video'
  | 'generic'

export type RenderMode =
  | 'native_video'
  | 'native_music'
  | 'embed'
  | 'preview_card'
  | 'link_only'

// ── Canonical media descriptor ─────────────────────────────

export interface IdentifiedMedia {
  kind: MediaKind
  provider: MediaProvider
  canonicalUrl: string
  title: string
  subtitle: string | null
  authorName: string | null
  thumbnailUrl: string | null
  posterUrl: string | null
  embedHtml: string | null
  embedUrl: string | null
  playbackUrl: string | null
  durationMs: number | null
  aspectRatio: string | null
  renderMode: RenderMode
  connectionRequired: boolean
  rawMetadata: Record<string, unknown>
}

// ── Provider render defaults ───────────────────────────────

export const PROVIDER_RENDER_DEFAULTS: Record<
  MediaProvider,
  { preferredMode: RenderMode; fallbackMode: RenderMode }
> = {
  youtube:        { preferredMode: 'embed',        fallbackMode: 'preview_card' },
  tiktok:         { preferredMode: 'embed',        fallbackMode: 'preview_card' },
  instagram:      { preferredMode: 'embed',        fallbackMode: 'preview_card' },
  x:              { preferredMode: 'preview_card', fallbackMode: 'link_only'    },
  spotify:        { preferredMode: 'preview_card', fallbackMode: 'link_only'    },
  apple_music:    { preferredMode: 'preview_card', fallbackMode: 'link_only'    },
  soundcloud:     { preferredMode: 'embed',        fallbackMode: 'preview_card' },
  vimeo:          { preferredMode: 'embed',        fallbackMode: 'preview_card' },
  bandcamp:       { preferredMode: 'embed',        fallbackMode: 'preview_card' },
  github:         { preferredMode: 'preview_card', fallbackMode: 'link_only'    },
  letterboxd:     { preferredMode: 'preview_card', fallbackMode: 'link_only'    },
  uploaded_video: { preferredMode: 'native_video', fallbackMode: 'preview_card' },
  generic:        { preferredMode: 'preview_card', fallbackMode: 'link_only'    },
}

// ── Bridge: ContentType → MediaKind ────────────────────────

const KIND_MAP: Record<string, MediaKind> = {
  youtube:    'video',
  vimeo:      'video',
  video:      'video',
  spotify:    'music',
  soundcloud: 'music',
  bandcamp:   'music',
  twitter:    'social',
  instagram:  'social',
  tiktok:     'social',
  github:     'link',
  letterboxd: 'link',
  image:      'image',
  link:       'link',
  thought:    'link',
  payment:    'link',
}

export function contentTypeToKind(ct: ContentType | string): MediaKind {
  return KIND_MAP[ct] || 'link'
}

// ── Bridge: ContentType → MediaProvider ────────────────────

const PROVIDER_MAP: Record<string, MediaProvider> = {
  youtube:    'youtube',
  spotify:    'spotify',
  twitter:    'x',
  instagram:  'instagram',
  tiktok:     'tiktok',
  vimeo:      'vimeo',
  soundcloud: 'soundcloud',
  bandcamp:   'bandcamp',
  github:     'github',
  letterboxd: 'letterboxd',
  video:      'uploaded_video',
}

export function contentTypeToProvider(ct: ContentType | string): MediaProvider {
  return PROVIDER_MAP[ct] || 'generic'
}

// ── Bridge: legacy render_mode → RenderMode ────────────────

export function renderModeFromLegacy(platform: string, legacyRenderMode: string): RenderMode {
  if (platform === 'video') return 'native_video'

  const provider = PROVIDER_MAP[platform]
  if (provider) {
    const defaults = PROVIDER_RENDER_DEFAULTS[provider]
    // Ghost mode on social platforms renders as preview cards, not embeds
    if (legacyRenderMode === 'ghost' && defaults.preferredMode === 'embed') {
      const socialPlatforms = new Set(['instagram', 'tiktok', 'x'])
      if (socialPlatforms.has(provider)) return defaults.fallbackMode
    }
    return defaults.preferredMode
  }

  return 'link_only'
}

// ── Type guard: new-style render modes ─────────────────────

const NEW_STYLE_MODES = new Set<string>([
  'preview_card',
  'native_video',
  'native_music',
  'link_only',
])

/**
 * Returns true for render_mode values that only the new pipeline produces.
 * Legacy values ('ghost', 'embed', undefined) return false, ensuring
 * existing tiles fall through to the legacy ContentCard/GhostTile paths.
 */
export function isNewStyleRenderMode(value: string | undefined | null): value is RenderMode {
  if (!value) return false
  return NEW_STYLE_MODES.has(value)
}
