/**
 * Tile Rendering Contract
 *
 * Single source of truth for:
 *   1. resolveCanonicalType — what renderer a tile should use
 *   2. canRenderPublicTile  — whether a tile has enough data for any renderer
 *
 * Invariant: a row is not a tile until it has a known type, required data,
 * and an explicit renderer. No silent fallthrough. No empty shells.
 */

import { mediaTypeFromUrl } from '@/lib/media'

// ── Regexes (shared with UnifiedTile.tsx) ──

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|heic|avif|svg)($|\?)/i
const EMBED_URL = /(?:youtube\.com|youtu\.be|vimeo\.com|soundcloud\.com|open\.spotify\.com|music\.apple\.com|bandcamp\.com)/i

// ── Canonical type resolution ──

export type CanonicalType = 'video' | 'image' | 'thought' | 'content'

/**
 * Determines the canonical rendering type for a tile.
 *
 * Priority:
 *   1. type === 'thought' → thought
 *   2. URL matches embed provider → content (ContentCard)
 *   3. media_kind or URL extension → video or image
 *   4. stored type fallback → video or image
 *   5. default → content
 */
export function resolveCanonicalType(
  type: string,
  url: string,
  mediaKind?: string | null,
): CanonicalType {
  if (type === 'thought') return 'thought'
  if (EMBED_URL.test(url)) return 'content'
  const detected = mediaTypeFromUrl(url, mediaKind)
  if (detected === 'video') return 'video'
  if (detected === 'image') return 'image'
  if (type === 'video') return 'video'
  if (IMAGE_EXT.test(url)) return 'image'
  if (type === 'image') return 'image'
  return 'content'
}

// ── Renderability guard ──

interface TileRow {
  type: string
  url: string
  title: string | null
  thumbnail_url: string | null
  embed_html: string | null
  render_mode?: string | null
  container_label?: string | null
  container_cover_url?: string | null
  media_kind?: string | null
}

/**
 * Returns true if the tile row has enough structural data for at least one
 * known renderer. Does NOT check network reachability — no HEAD requests,
 * no fetch. Pure shape check.
 *
 * Rules:
 *   container    → always renderable (has label fallback)
 *   thought/text → renderable if title exists
 *   payment/CTA  → always renderable (static content)
 *   video        → require url
 *   image        → require url
 *   content (youtube/spotify/link) → require url or thumbnail or embed_html
 *   unknown      → false
 */
export function canRenderPublicTile(item: TileRow): boolean {
  const { type, url, title, thumbnail_url, embed_html, render_mode } = item

  // Container tiles always render (have label fallback)
  if (type === 'container') return true

  // Payment/CTA always render (static content)
  if (type === 'payment') return true
  if (url && (url.includes('buy.stripe.com') || url.includes('checkout.stripe.com'))) return true

  // Thought/text tiles render if they have text content
  if (type === 'thought') return !!(title && title.trim())

  // RenderMode-driven tiles need url
  if (render_mode === 'native_video') return !!url
  if (render_mode === 'embed') return !!(url || embed_html)
  if (render_mode === 'preview_card' || render_mode === 'native_music' || render_mode === 'link_only') return !!url

  // Ghost tiles need a url for media_id derivation
  if (render_mode === 'ghost') return !!url

  // Canonical type resolution
  const canonicalType = resolveCanonicalType(type, url || '', item.media_kind)

  switch (canonicalType) {
    case 'thought':
      return !!(title && title.trim())
    case 'video':
      return !!url
    case 'image':
      // Image requires url for TileImage. If url is missing, fall through
      // to the ContentCard catch-all check below (mirrors UnifiedTile dispatch).
      if (url) return true
      break
    case 'content':
      return !!(url || thumbnail_url || embed_html)
  }

  // ContentCard catch-all — same guard as UnifiedTile's final content branch
  return !!(url || thumbnail_url || embed_html)
}
