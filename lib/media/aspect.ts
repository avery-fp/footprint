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
  // Deterministic vertical sources win over stored aspect.
  // TikTok and YouTube Shorts URLs are always 9:16 — stored 'square' or 'wide'
  // on these rows is residue from earlier defaults and should not override
  // the native body shape.
  if (type === 'tiktok') return 'tall'
  if (url?.includes('/shorts/')) return 'tall'

  if (stored && stored !== 'square') return stored
  if (stored === 'square') return 'square'
  if (type === 'spotify') return 'portrait'
  if (type === 'youtube' || type === 'vimeo') return 'wide'
  // Uploaded videos — square by default (most phone content is portrait/square).
  // Stored aspect overrides this (handled above).
  if (type === 'video') return 'square'
  if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return 'square'
  if (type === 'image') return 'square'
  return 'square'
}

/**
 * Check if a tile is effectively a video (type=video or image with video extension).
 * Used for video tile dominance logic.
 */
export function isVideoTile(type: string, url?: string): boolean {
  return type === 'video' || type === 'youtube' || type === 'vimeo'
    || (type === 'image' && !!url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i))
}

// ── Grid class helpers ──────────────────────────────────────

/**
 * Default public grid — aspect ratio bundled into the class string.
 * Used by PublicPage default layout.
 *
 * 3-state topology:
 *   S (1) = The Artifact — 1×1 square thumbnail
 *   M (2) = The Statement — 2×1 landscape card (4:3)
 *   L (3) = The Hero — 2×2 square anchor
 *
 * Size dictates aspect. No overrides.
 *
 * Pass isVideo=true for video tile dominance: videos always get col-span-2 row-span-1.
 */
export function getGridClass(size: number, aspect: string | null | undefined, isVideo = false): string {
  // Doctrine: shape from aspect, presence from size. Two orthogonal axes.
  // Three shapes: tall (9:16 video, 3:4 image) | wide (16:9) | square (1:1).
  // Size only varies col/row span — never converts shape.

  if (isVideo) {
    // Vertical video — locked 9:16 across S/M/L.
    if (aspect === 'tall' || aspect === 'portrait') {
      if (size >= 3) return 'col-span-2 row-span-3 md:col-span-2 md:row-span-3 aspect-[9/16]'
      if (size >= 2) return 'col-span-1 row-span-2 md:col-span-2 md:row-span-3 aspect-[9/16]'
      return 'col-span-1 row-span-2 aspect-[9/16]'
    }
    // Square video — locked 1:1 across S/M/L. (Was silently widescreen.)
    if (aspect === 'square') {
      if (size >= 3) return 'col-span-3 row-span-3 aspect-square'
      if (size >= 2) return 'col-span-2 row-span-2 aspect-square'
      return 'col-span-1 row-span-1 aspect-square'
    }
    // Widescreen video (default for video).
    if (size >= 3) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-2 aspect-video'
    if (size >= 2) return 'col-span-2 row-span-1 md:col-span-2 md:row-span-1 aspect-video'
    return 'col-span-2 row-span-1 aspect-video'
  }

  if (aspect === 'wide' || aspect === 'landscape') {
    if (size >= 3) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-2 aspect-video'
    if (size >= 2) return 'col-span-2 row-span-1 md:col-span-2 md:row-span-1 aspect-video'
    return 'col-span-2 row-span-1 aspect-video'
  }
  if (aspect === 'tall' || aspect === 'portrait') {
    if (size >= 3) return 'col-span-1 row-span-3 md:col-span-2 md:row-span-3 aspect-[3/4]'
    if (size >= 2) return 'col-span-1 row-span-2 md:col-span-2 md:row-span-2 aspect-[3/4]'
    return 'col-span-1 row-span-2 aspect-[3/4]'
  }
  // Square (also the fallback for unset/unknown aspect).
  // Previously: S→3:4 portrait, M→4:3 landscape — size shape-shifted the
  // tile. That violated the orthogonal-axes doctrine. Now locked 1:1.
  if (size >= 3) return 'col-span-2 row-span-2 aspect-square'
  if (size >= 2) return 'col-span-2 row-span-2 aspect-square'
  return 'col-span-1 row-span-1 aspect-square'
}

/**
 * Home-style grid — spanning only, no aspect class bundled.
 * Aspect is handled separately via getAspectClass().
 *
 * 3-state topology: S → M → L (same as getGridClass but without aspect classes).
 *
 * Pass isVideo=true for video tile dominance.
 */
export function getGridClassHome(size: number, aspect: string, isVideo = false): string {
  // Same doctrine as getGridClass — shape from aspect, presence from size.
  // This variant returns spans only (no aspect class baked in).
  if (isVideo) {
    if (aspect === 'tall' || aspect === 'portrait') {
      if (size >= 3) return 'col-span-2 row-span-3 md:col-span-2 md:row-span-3'
      if (size >= 2) return 'col-span-1 row-span-2 md:col-span-2 md:row-span-3'
      return 'col-span-1 row-span-2'
    }
    if (aspect === 'square') {
      if (size >= 3) return 'col-span-3 row-span-3'
      if (size >= 2) return 'col-span-2 row-span-2'
      return 'col-span-1 row-span-1'
    }
    if (size >= 3) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-2'
    if (size >= 2) return 'col-span-2 row-span-1 md:col-span-2 md:row-span-1'
    return 'col-span-2 row-span-1'
  }
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
  // Square — locked across S/M/L (was previously size-shape-shifted).
  if (size >= 3) return 'col-span-2 row-span-2'
  if (size >= 2) return 'col-span-2 row-span-2'
  return 'col-span-1 row-span-1'
}

/**
 * Standalone CSS aspect-ratio class.
 */
export function getAspectClass(aspect: string): string {
  if (aspect === 'wide' || aspect === 'landscape') return 'aspect-video'
  if (aspect === 'tall') return 'aspect-[9/16]'
  if (aspect === 'portrait') return 'aspect-[3/4]'
  if (aspect === 'auto') return ''
  return 'col-span-1 row-span-2 aspect-[3/4]'
}

/**
 * Object-fit class for content within a tile.
 * Doctrine: cover everywhere. Tile = poster, poster fills the frame.
 * If the tile shape is wrong for the content (e.g. uploaded vertical video
 * forced into aspect-video), edges crop — preferable to dead container bars.
 * Native-body shape selection is the follow-up.
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
