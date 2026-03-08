/**
 * Room-level layout configuration
 *
 * Two modes:
 *  - grid: uniform square tiles (default)
 *  - editorial: edit-page-style grid with size/aspect spanning
 */

export type RoomLayout = 'grid' | 'editorial'

interface LayoutConfig {
  containerClass: string
  /** Static tile class — for grid mode only (editorial computes per-tile) */
  tileClass: string
  /** true = Next.js Image fill + object-cover (square crop) */
  useFillMode: boolean
  /** true = tiles use getGridClass/getAspectClass for per-tile sizing */
  perTileSizing: boolean
  gap: string
}

const LAYOUTS: Record<RoomLayout, LayoutConfig> = {
  grid: {
    containerClass: 'grid grid-cols-2 md:grid-cols-4 gap-[3px]',
    tileClass: 'aspect-square relative overflow-hidden rounded-xl',
    useFillMode: true,
    perTileSizing: false,
    gap: '3px',
  },
  editorial: {
    containerClass: 'grid grid-cols-2 md:grid-cols-4 gap-[3px]',
    tileClass: 'relative overflow-hidden rounded-xl',
    useFillMode: false,
    perTileSizing: true,
    gap: '3px',
  },
}

export function getGridLayout(layout?: string): LayoutConfig {
  if (layout && layout in LAYOUTS) return LAYOUTS[layout as RoomLayout]
  return LAYOUTS.grid
}

export function nextLayout(current?: string): RoomLayout {
  return current === 'grid' ? 'editorial' : 'grid'
}

export const LAYOUT_LABELS: Record<RoomLayout, string> = {
  grid: 'grid',
  editorial: 'editorial',
}
