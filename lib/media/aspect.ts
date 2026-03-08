/**
 * ASPECT RATIO & GRID CLASS HELPERS
 *
 * Extracted from PublicPage.tsx and home/page.tsx.
 * Single source of truth for aspect resolution and grid class mapping.
 */

// ── Aspect resolution ───────────────────────────────────────

/**
 * Resolve the effective aspect ratio for a tile.
 * Priority: stored value > content-type default > 'square'
 *
 * Video tiles get 'wide' by default — they dominate the grid at col-span-2.
 * The detected file aspect is used for object-fit only, not container sizing.
 */
export function resolveAspect(
  stored: string | null | undefined,
  type: string,
  url?: string
): string {
  if (stored && stored !== 'square') return stored
  if (stored === 'square') return 'square'
  if (type === 'youtube' || type === 'vimeo') return 'wide'
  // Video dominance — all videos default to wide (col-span-2 row-span-1)
  if (type === 'video') return 'wide'
  if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return 'wide'
  if (type === 'image') return 'auto'
  return 'square'
}

/**
 * Check if a tile is effectively a video (type=video or image with video extension).
 * Used for video tile dominance logic.
 */
export function isVideoTile(type: string, url?: string): boolean {
  return type === 'video' || (type === 'image' && !!url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i))
}

// ── Grid class helpers ──────────────────────────────────────

/**
 * Default public grid — aspect ratio bundled into the class string.
 * Used by PublicPage default layout.
 *
 * Pass isVideo=true for video tile dominance: videos always get col-span-2 row-span-2.
 */
export function getGridClass(size: number, aspect: string | null | undefined, isVideo = false): string {
  // Video dominance — force col-span-2 row-span-2 on all surfaces
  if (isVideo) {
    return 'col-span-2 row-span-2 aspect-video'
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
  // square or auto — default 1×1 tile
  if (size >= 3) return 'col-span-2 row-span-2 md:col-span-3 md:row-span-3 aspect-square'
  if (size >= 2) return 'col-span-2 row-span-2 aspect-square'
  return 'aspect-square'
}

/**
 * Home-style grid — spanning only, no aspect class bundled.
 * Aspect is handled separately via getAspectClass().
 *
 * Pass isVideo=true for video tile dominance.
 */
export function getGridClassHome(size: number, aspect: string, isVideo = false): string {
  // Video dominance — force col-span-2 row-span-2
  if (isVideo) {
    return 'col-span-2 row-span-2'
  }
  if (aspect === 'wide' || aspect === 'landscape') {
    if (size >= 3) return 'col-span-2 row-span-1 md:col-span-4 md:row-span-2'
    if (size >= 2) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-1'
    return 'col-span-2 row-span-1'
  }
  if (aspect === 'tall' || aspect === 'portrait') {
    if (size >= 3) return 'col-span-2 row-span-3 md:col-span-2 md:row-span-4'
    if (size >= 2) return 'col-span-1 row-span-3 md:col-span-2 md:row-span-3'
    return 'col-span-1 row-span-2'
  }
  if (size >= 3) return 'col-span-2 row-span-2 md:col-span-3 md:row-span-3'
  if (size >= 2) return 'col-span-2 row-span-2'
  return ''
}

/**
 * Standalone CSS aspect-ratio class.
 */
export function getAspectClass(aspect: string): string {
  if (aspect === 'wide' || aspect === 'landscape') return 'aspect-video'
  if (aspect === 'tall') return 'aspect-[9/16]'
  if (aspect === 'portrait') return 'aspect-[3/4]'
  if (aspect === 'auto') return ''
  return 'aspect-square'
}

/**
 * Object-fit class for content within a tile.
 */
export function getObjectFit(_aspect: string): string {
  return 'object-contain'
}

/**
 * Responsive sizes attribute for Next.js Image.
 */
export function getImageSizes(size: number): string {
  if (size >= 3) return '(max-width: 768px) 100vw, 880px'
  if (size >= 2) return '(max-width: 768px) 50vw, 50vw'
  return '(max-width: 768px) 33vw, 25vw'
}
