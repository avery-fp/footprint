/**
 * ASPECT RATIO & GRID CLASS HELPERS
 *
 * Extracted from PublicPage.tsx and home/page.tsx.
 * Single source of truth for aspect resolution and grid class mapping.
 */

// ── Aspect resolution ───────────────────────────────────────

/**
 * Resolve the effective aspect ratio for a tile.
 *
 * Priority:
 *   1. explicit stored square | wide | tall  → return it
 *   2. stored null / undefined / 'auto'       → use smart defaults
 *   3. URL/type defaults
 *
 * TikTok / Shorts default to 'tall' on fresh tiles, but explicit user picks
 * win — flipping a TikTok tile to 'wide' or 'square' will persist.
 */
export function resolveAspect(
  stored: string | null | undefined,
  type: string,
  url?: string
): string {
  // User-set shape wins.
  if (stored === 'square' || stored === 'wide' || stored === 'tall') return stored

  // Smart defaults (only when stored is null / undefined / 'auto' / unknown)
  if (type === 'tiktok') return 'tall'
  if (url?.includes('/shorts/')) return 'tall'
  if (type === 'spotify') return 'portrait'
  if (type === 'youtube' || type === 'vimeo') return 'wide'
  if (type === 'video') return 'square'
  if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return 'square'
  // Pure images with no stored aspect fall through to 'auto' so existing
  // image tiles keep legacy size topology in the grid math. When the user
  // explicitly picks 'square' via the editor, that's stored and resolves
  // above to true-square geometry.
  if (type === 'image') return 'auto'
  return 'auto'
}

/**
 * Check if a tile is effectively a video (type=video or image with video extension).
 * Used for UI gating and the video-square geometry branch.
 */
export function isVideoTile(type: string, url?: string): boolean {
  return type === 'video' || type === 'youtube' || type === 'vimeo'
    || (type === 'image' && !!url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i))
}

// ── Grid class helpers ──────────────────────────────────────

/**
 * Public grid — aspect ratio bundled into the class string.
 *
 * Shape × size grammar. The video-only span short-circuit is removed; layout
 * follows shape × size for every content type.
 *
 * Video square uses true-square geometry (1×1 / 2×2). Non-video square keeps
 * legacy size topology so existing image/text tiles don't shift in this PR.
 *
 * The `isVideo` parameter survives for caller compatibility and is consulted
 * only inside the square branch (where video and non-video diverge).
 */
export function getGridClass(size: number, aspect: string | null | undefined, _isVideo = false): string {
  if (aspect === 'wide' || aspect === 'landscape') {
    if (size >= 3) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-2 aspect-video'
    if (size >= 2) return 'col-span-2 row-span-1 md:col-span-2 md:row-span-1 aspect-video'
    return 'col-span-2 row-span-1 aspect-video'
  }
  if (aspect === 'tall' || aspect === 'portrait') {
    if (size >= 3) return 'col-span-1 row-span-3 md:col-span-2 md:row-span-3 aspect-[9/16]'
    if (size >= 2) return 'col-span-1 row-span-2 md:col-span-2 md:row-span-2 aspect-[9/16]'
    return 'col-span-1 row-span-2 aspect-[9/16]'
  }
  if (aspect === 'square') {
    // Explicit square. S widened from 1×1 to 1×2 (3:4) so it has presence —
    // the square outlier (wide-S and tall-S already span 2 cells). M = 2×1,
    // L = 2×2 true-square.
    if (size >= 3) return 'col-span-2 row-span-2 aspect-square'
    if (size >= 2) return 'col-span-2 row-span-1'
    return 'col-span-1 row-span-2 aspect-[3/4]'
  }
  // Unspecified / 'auto': legacy 3-state size topology preserved
  // S (1) = 1×2 aspect-[3/4]  →  M (2) = 2×1 aspect-[4/3]  →  L (3) = 2×2 aspect-square
  if (size >= 3) return 'col-span-2 row-span-2 aspect-square'
  if (size >= 2) return 'col-span-2 row-span-1 aspect-[4/3]'
  return 'col-span-1 row-span-2 aspect-[3/4]'
}

/**
 * Home grid — spanning only, no aspect class bundled.
 * Aspect is handled separately via getAspectClass().
 */
export function getGridClassHome(size: number, aspect: string, _isVideo = false): string {
  if (aspect === 'wide' || aspect === 'landscape') {
    if (size >= 3) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-2'
    if (size >= 2) return 'col-span-2 row-span-1 md:col-span-2 md:row-span-1'
    return 'col-span-2 row-span-1'
  }
  if (aspect === 'tall' || aspect === 'portrait') {
    if (size >= 3) return 'col-span-1 row-span-3 md:col-span-2 md:row-span-3'
    if (size >= 2) return 'col-span-1 row-span-2 md:col-span-2 md:row-span-2'
    return 'col-span-1 row-span-2'
  }
  if (aspect === 'square') {
    // Explicit square (image or video), span-only. S widened to 1×2 so it
    // matches wide-S/tall-S in cell footprint.
    if (size >= 3) return 'col-span-2 row-span-2'
    if (size >= 2) return 'col-span-2 row-span-1'
    return 'col-span-1 row-span-2'
  }
  // Non-video square / unspecified: legacy size topology preserved
  if (size >= 3) return 'col-span-2 row-span-2'
  if (size >= 2) return 'col-span-2 row-span-1'
  return ''
}

/**
 * Standalone CSS aspect-ratio class.
 * tall and portrait both render as true vertical 9:16 in this PR (no migration).
 */
export function getAspectClass(aspect: string): string {
  if (aspect === 'wide' || aspect === 'landscape') return 'aspect-video'
  if (aspect === 'tall' || aspect === 'portrait') return 'aspect-[9/16]'
  if (aspect === 'auto') return ''
  return 'col-span-1 row-span-2 aspect-[9/16]'
}

/**
 * Object-fit class for content within a tile.
 * Doctrine: cover everywhere. Tile = poster, poster fills the frame.
 * User picks the shape via the editor to eliminate cropping.
 */
export function getObjectFit(_aspect?: string, _size?: number): string {
  return 'object-cover'
}

/**
 * Responsive sizes attribute for Next.js Image.
 */
export function getImageSizes(size: number): string {
  if (size >= 3) return '(max-width: 768px) 100vw, 50vw'
  if (size >= 2) return '(max-width: 768px) 100vw, 50vw'
  return '(max-width: 768px) 33vw, 25vw'
}
