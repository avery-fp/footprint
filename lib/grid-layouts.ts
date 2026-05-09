/**
 * Room-level layout configuration
 *
 * Three modes, three identities:
 *  - grid:       uniform masonry — every column the same width, tile height
 *                follows native aspect. Browse-mode reading.
 *  - horizontal: cinematic rail — fixed-height row of variable-width tiles,
 *                each rendered at its own native aspect. Swipe/scroll.
 *  - editorial:  magazine asymmetry — first tile becomes the hero (full
 *                width, native aspect), supporting tiles flow beneath in
 *                two-column masonry, also at native aspect.
 *
 * NO BLACK BARS doctrine: every tile renders at its content's native
 * aspect. The shape pill (square/wide/tall) is a fallback when source
 * dimensions are unknown — never a forced cell shape.
 *
 * Legacy values self-heal in lib/loadFootprint.ts: rail → horizontal,
 * mix → editorial. The DB can carry stale values forever; reads
 * normalize on the way out.
 */

export type RoomLayout = 'grid' | 'horizontal' | 'editorial'

interface LayoutConfig {
  /**
   * Container around the tile loop. For grid + editorial-supporting this
   * uses CSS columns (masonry). For horizontal it's a flex row.
   */
  containerClass: string
  /**
   * Per-tile wrapper class — applied on top of any aspect-ratio inline
   * style the renderer adds for native-aspect rendering.
   */
  tileClass: string
  /** True for the horizontal rail; signals the renderer to use a flex row. */
  isHorizontal?: boolean
}

const LAYOUTS: Record<RoomLayout, LayoutConfig> = {
  grid: {
    // CSS columns gives Pinterest-style masonry where each column is the
    // same width but tiles flow at their native heights. break-inside-avoid
    // keeps a single tile from splitting across columns. Page-shoulders
    // doctrine: 16px mobile, 24px tablet, 32px desktop horizontal padding.
    containerClass: 'columns-2 md:columns-3 gap-2.5 md:gap-3 px-4 md:px-6 lg:px-8',
    tileClass: 'mb-2.5 md:mb-3 break-inside-avoid relative overflow-hidden rounded-2xl',
  },
  horizontal: {
    containerClass: 'flex flex-row overflow-x-auto gap-4 pb-4 hide-scrollbar',
    tileClass: 'flex-shrink-0 snap-center relative overflow-hidden rounded-2xl',
    isHorizontal: true,
  },
  editorial: {
    // The supporting (post-hero) container — hero is rendered in a sibling
    // wrapper. Two columns on every viewport keeps the magazine feel.
    containerClass: 'columns-2 gap-2.5 md:gap-3 px-4 md:px-6 lg:px-8',
    tileClass: 'mb-2.5 md:mb-3 break-inside-avoid relative overflow-hidden rounded-2xl',
  },
}

export function getGridLayout(layout?: string): LayoutConfig {
  // Map legacy values: rail → horizontal, mix → editorial.
  const mapped =
    layout === 'rail' ? 'horizontal' :
    layout === 'mix' ? 'editorial' :
    layout
  if (mapped && mapped in LAYOUTS) return LAYOUTS[mapped as RoomLayout]
  return LAYOUTS.grid
}

export function nextLayout(current?: string): RoomLayout {
  const mapped =
    current === 'rail' ? 'horizontal' :
    current === 'mix' ? 'editorial' :
    current
  if (mapped === 'grid') return 'horizontal'
  if (mapped === 'horizontal') return 'editorial'
  return 'grid'
}

export const LAYOUT_LABELS: Record<RoomLayout, string> = {
  grid: 'grid',
  horizontal: 'horizontal',
  editorial: 'editorial',
}

/**
 * Resolve a tile's native aspect-ratio for CSS. Falls back to the user's
 * shape pill when source dimensions are unknown — never letterbox.
 *
 * Priority: stored shape pick → smart default by type → square fallback.
 * (For images, SAspectShell may further refine the cell on natural-dim
 * load at runtime.)
 */
export function tileAspectRatio(
  resolvedAspect: string | null | undefined
): string {
  if (resolvedAspect === 'wide' || resolvedAspect === 'landscape') return '16 / 9'
  if (resolvedAspect === 'tall' || resolvedAspect === 'portrait') return '9 / 16'
  if (resolvedAspect === 'square') return '1 / 1'
  // 'auto', null, undefined, unknown — neutral square. Image tiles will
  // refine themselves via SAspectShell on natural-dim load.
  return '1 / 1'
}
