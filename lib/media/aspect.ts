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
  const isMusic = type === 'spotify' || type === 'apple_music'

  // Music intentionally has only two useful forms: compact bar or square
  // cover. Legacy tall values collapse to the bar instead of creating
  // cropped provider-player states.
  if (isMusic) {
    if (stored === 'square') return 'square'
    return 'wide'
  }

  // User-set shape wins.
  if (stored === 'square' || stored === 'wide' || stored === 'tall') return stored

  // Smart defaults (only when stored is null / undefined / 'auto' / unknown)
  if (type === 'tiktok') return 'tall'
  if (url?.includes('/shorts/')) return 'tall'
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
 * Public grid — aspect ratio + col/row spans bundled into the class string.
 *
 * Size × shape × media grammar. Mobile is 2-col, desktop is 4-col. Size
 * is the footprint class; aspect and video-ness still carry physical
 * gravity (wide tiles span rows of width, tall tiles tower, videos
 * anchor) so the room composes a masonry rhythm instead of uniform cells.
 *
 * Video dominance: wide video gets a minimum half-row footprint
 * (col-span-2 row-span-1) at every size, tall video towers, and square
 * video remains honest square. Without this, size=1 wide videos render as
 * postage stamps.
 */
export function getGridClass(size: number, aspect: string | null | undefined, isVideo = false, type?: string): string {
  if (isVideo) {
    if (aspect === 'tall' || aspect === 'portrait') {
      return 'col-span-1 row-span-2 aspect-[9/16]'
    }
    if (aspect === 'square') {
      return 'col-span-1 aspect-square'
    }
    return 'col-span-2 row-span-1 aspect-video'
  }

  // Spotify's compact player is intentionally short; Apple Music's native
  // single-player needs more vertical room to show its controls cleanly.
  if (type === 'spotify' && (aspect === 'wide' || aspect === 'landscape')) {
    return 'col-span-2 row-span-1 aspect-[11/2]'
  }

  if (type === 'apple_music' && (aspect === 'wide' || aspect === 'landscape')) {
    return 'col-span-2 row-span-1 aspect-[5/2]'
  }

  if (aspect === 'wide' || aspect === 'landscape') {
    if (size >= 3) return 'col-span-2 row-span-1 md:col-span-4 md:row-span-2 aspect-video'
    if (size >= 2) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-1 aspect-video'
    return 'col-span-2 row-span-1 aspect-video'
  }

  if (aspect === 'tall' || aspect === 'portrait') {
    if (size >= 3) return 'col-span-2 row-span-3 md:col-span-2 md:row-span-4 aspect-[3/4]'
    if (size >= 2) return 'col-span-1 row-span-3 md:col-span-2 md:row-span-3 aspect-[3/4]'
    return 'col-span-1 row-span-2 aspect-[3/4]'
  }

  if (aspect === 'square') {
    if (size >= 3) return 'col-span-2 row-span-2 md:col-span-3 md:row-span-3 aspect-square'
    if (size >= 2) return 'col-span-2 row-span-2 aspect-square'
    return 'col-span-1 aspect-square'
  }

  // 'auto' / unspecified: size drives aspect for legacy image tiles.
  const cols =
    size >= 3 ? 'col-span-2 md:col-span-3' :
    size >= 2 ? 'col-span-2 md:col-span-2' :
    'col-span-1'
  if (size >= 3) return `${cols} aspect-video`
  if (size >= 2) return `${cols} aspect-[4/5]`
  return `${cols} aspect-[3/4]`
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
    // Span-only mirror of getGridClass: square at S spans 1×2 to share
    // footprint with wide-S and tall-S; M and L keep their true-square
    // spans. Aspect is applied separately via getAspectClass.
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
