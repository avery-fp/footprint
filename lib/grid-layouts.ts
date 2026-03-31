/**
 * Room-level layout configuration
 *
 * Three modes:
 *  - grid: uniform square tiles (default)
 *  - mix:  asymmetric per-tile sizing, dense packing
 *  - rail: horizontal scroll exhibition strip
 */

export type RoomLayout = 'grid' | 'mix' | 'rail'

interface LayoutConfig {
  containerClass: string
  /** Static tile class — grid/rail use this; mix computes per-tile */
  tileClass: string
  /** true = Next.js Image fill + object-cover (square crop) */
  useFillMode: boolean
  /** true = tiles use getGridClass/getAspectClass for per-tile sizing */
  perTileSizing: boolean
  gap: string
  /** true = horizontal rail mode (render as flex row, not CSS grid) */
  isRail?: boolean
}

const LAYOUTS: Record<RoomLayout, LayoutConfig> = {
  grid: {
    containerClass: 'grid grid-cols-2 md:grid-cols-4 gap-3',
    tileClass: 'aspect-square relative overflow-hidden rounded-2xl',
    useFillMode: true,
    perTileSizing: false,
    gap: '12px',
  },
  mix: {
    containerClass: 'grid grid-cols-2 md:grid-cols-4 gap-2',
    tileClass: 'relative overflow-hidden rounded-2xl',
    useFillMode: false,
    perTileSizing: true,
    gap: '8px',
  },
  rail: {
    containerClass: 'flex flex-row overflow-x-auto gap-5 pb-4',
    tileClass: 'flex-shrink-0 snap-start relative overflow-hidden rounded-2xl',
    useFillMode: true,
    perTileSizing: false,
    gap: '20px',
    isRail: true,
  },
}

export function getGridLayout(layout?: string): LayoutConfig {
  // map legacy 'editorial' to 'mix'
  const resolved = layout === 'editorial' ? 'mix' : layout
  if (resolved && resolved in LAYOUTS) return LAYOUTS[resolved as RoomLayout]
  return LAYOUTS.grid
}

export function nextLayout(current?: string): RoomLayout {
  if (current === 'grid') return 'mix'
  if (current === 'mix') return 'rail'
  return 'grid'
}

export const LAYOUT_LABELS: Record<RoomLayout, string> = {
  grid: 'Grid',
  mix: 'Mix',
  rail: 'Rail',
}
