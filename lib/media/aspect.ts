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
 * Size × shape grammar. Mobile is 2-col, desktop is 3-col. Size pushes
 * col-span up; shape sets aspect-ratio.
 *
 *   S (1) — col-span-1 everywhere.
 *   M (2) — col-span-1 mobile, md:col-span-2 desktop. Steps up only on
 *           the wider grid, where the extra column exists.
 *   L (3) — col-span-2 mobile, md:col-span-3 desktop. The showcase pick;
 *           full-bleed on both. User explicitly opted in via the L pill.
 *
 * Tall (aspect-[9/16]) is special-cased: at col-span-2 mobile it's
 * ~178vw tall — two viewports for one tile — so tall caps at col-span-1
 * mobile and md:col-span-2 desktop regardless of size. Same scroll-bomb
 * logic at col-span-3 desktop.
 */
export function getGridClass(size: number, aspect: string | null | undefined, isVideo = false): string {
  // Video tiles floor at M (size 2). Video at S is unreadable — playback
  // controls don't fit, posters get crushed, and the eye can't track
  // motion at thumbnail scale. The size pill still goes M → L; S just
  // upgrades silently.
  const effectiveSize = isVideo && size < 2 ? 2 : size

  if (aspect === 'tall' || aspect === 'portrait') {
    const cols = effectiveSize >= 2 ? 'col-span-1 md:col-span-2' : 'col-span-1'
    return `${cols} aspect-[9/16]`
  }

  // L caps at md:col-span-2 (not md:col-span-3). The col-span-3 jump was
  // too big — full grid width vs. two cols felt like a different page,
  // not a sibling. Keep the gap to one column at most.
  const cols =
    effectiveSize >= 3 ? 'col-span-2 md:col-span-2' :
    effectiveSize >= 2 ? 'col-span-1 md:col-span-2' :
    'col-span-1'

  if (aspect === 'wide' || aspect === 'landscape') return `${cols} aspect-video`
  if (aspect === 'square') return `${cols} aspect-square`

  // 'auto' / unspecified: size drives aspect, so mobile S/M (which share
  // col-span-1) still differentiate via a visible height delta.
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
