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
 */
export function resolveAspect(
  stored: string | null | undefined,
  type: string,
  url?: string
): string {
  if (stored && stored !== 'square') return stored
  if (stored === 'square') return 'square'
  if (type === 'youtube' || type === 'vimeo') return 'wide'
  if (type === 'video') return 'auto'
  if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return 'auto'
  if (type === 'image') return 'auto'
  return 'square'
}

// ── Grid class helpers ──────────────────────────────────────

/**
 * Default public grid — aspect ratio bundled into the class string.
 * Used by PublicPage default layout.
 */
export function getGridClass(size: number, aspect: string | null | undefined): string {
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
 */
export function getGridClassHome(size: number, aspect: string): string {
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
