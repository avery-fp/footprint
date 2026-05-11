/**
 * Room-level layout configuration
 *
 * Two modes:
 *  - grid:       responsive grid — tile width follows size, tile height
 *                follows native aspect. Browse-mode reading.
 *  - horizontal: cinematic rail — fixed-height row of variable-width tiles,
 *                each rendered at its own native aspect. Swipe/scroll.
 *
 * NO BLACK BARS doctrine: every tile renders at its content's native
 * aspect. The shape pill (square/wide/tall) is a fallback when source
 * dimensions are unknown — never a forced cell shape.
 *
 * Legacy values self-heal: rail → horizontal, mix/editorial → grid.
 * The DB can carry stale values forever; reads normalize on the way out.
 */

export type RoomLayout = 'grid' | 'horizontal'

interface LayoutConfig {
  /**
   * Container around the tile loop. Grid uses CSS grid so S/M/L can
   * change width. Horizontal is a flex row.
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
    containerClass: 'grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 px-4 md:px-6 lg:px-8 items-start',
    tileClass: 'relative overflow-hidden rounded-2xl',
  },
  horizontal: {
    containerClass: 'flex flex-row overflow-x-auto gap-4 pb-4 hide-scrollbar',
    tileClass: 'flex-shrink-0 snap-center relative overflow-hidden rounded-2xl',
    isHorizontal: true,
  },
}

export function getGridLayout(layout?: string): LayoutConfig {
  // Map legacy values: rail → horizontal, mix/editorial → grid.
  const mapped =
    layout === 'rail' ? 'horizontal' :
    layout === 'mix' ? 'grid' :
    layout === 'editorial' ? 'grid' :
    layout
  if (mapped && mapped in LAYOUTS) return LAYOUTS[mapped as RoomLayout]
  return LAYOUTS.grid
}

export function nextLayout(current?: string): RoomLayout {
  const mapped =
    current === 'rail' ? 'horizontal' :
    current === 'mix' ? 'grid' :
    current === 'editorial' ? 'grid' :
    current
  if (mapped === 'grid') return 'horizontal'
  return 'grid'
}

export const LAYOUT_LABELS: Record<RoomLayout, string> = {
  grid: 'grid',
  horizontal: 'horizontal',
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
