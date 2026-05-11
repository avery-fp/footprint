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
 * Size × shape grammar. Mobile is 2-col, desktop is 4-col. Size = col-span,
 * shape = aspect-ratio. Each step is a real footprint jump.
 *
 *   S (1) — col-span-1 mobile (1/2), md:col-span-1 desktop (1/4). Resting.
 *   M (2) — col-span-2 mobile (full), md:col-span-2 desktop (1/2). Editorial.
 *   L (3) — col-span-2 mobile (full), md:col-span-3 desktop (3/4). Anchor.
 *
 * Tall (aspect-[9/16]) is capped at col-span-1 mobile / md:col-span-2
 * desktop regardless of size — full-width tall at 9:16 is ~178vw tall on
 * mobile and ~56vh+ on desktop, a scroll bomb on either axis.
 *
 * Video render-time floor: video tiles floor at M. Emission defaults stay
 * at S (DB writes images and videos as size 1), but at render time a
 * landscape video at col-span-1 + aspect-video is a postage stamp on a
 * 4-col grid — aspect doesn't carry differentiation when the footprint
 * is that compressed. The floor is render-only and isVideo-gated; image
 * tiles stay at their true emitted size.
 */
export function getGridClass(size: number, aspect: string | null | undefined, isVideo = false): string {
  const effectiveSize = isVideo && size < 2 ? 2 : size

  if (aspect === 'tall' || aspect === 'portrait') {
    const cols = effectiveSize >= 2 ? 'col-span-1 md:col-span-2' : 'col-span-1'
    return `${cols} aspect-[9/16]`
  }

  const cols =
    effectiveSize >= 3 ? 'col-span-2 md:col-span-3' :
    effectiveSize >= 2 ? 'col-span-2 md:col-span-2' :
    'col-span-1'

  if (aspect === 'wide' || aspect === 'landscape') return `${cols} aspect-video`
  if (aspect === 'square') return `${cols} aspect-square`

  // 'auto' / unspecified: size drives aspect for legacy image tiles.
  if (effectiveSize >= 3) return `${cols} aspect-video`
  if (effectiveSize >= 2) return `${cols} aspect-[4/5]`
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
