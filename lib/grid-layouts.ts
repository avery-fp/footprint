/**
 * Room-level layout configuration
 *
 * Three modes:
 *  - brutalist: uniform square grid (default)
 *  - flow: CSS columns masonry, natural image heights
 *  - void: single-column editorial scroll
 */

export type RoomLayout = 'brutalist' | 'flow' | 'void'

interface LayoutConfig {
  containerClass: string
  tileClass: string
  /** true = Next.js Image fill + object-cover (square crop) */
  useFillMode: boolean
  gap: string
}

const LAYOUTS: Record<RoomLayout, LayoutConfig> = {
  brutalist: {
    containerClass: 'grid grid-cols-2 md:grid-cols-4 gap-[3px]',
    tileClass: 'aspect-square relative overflow-hidden rounded-xl',
    useFillMode: true,
    gap: '3px',
  },
  flow: {
    containerClass: 'columns-2 md:columns-3 gap-[3px]',
    tileClass: 'break-inside-avoid mb-[3px] rounded-xl overflow-hidden',
    useFillMode: false,
    gap: '3px',
  },
  void: {
    containerClass: 'flex flex-col items-center gap-3',
    tileClass: 'w-full max-w-2xl rounded-xl overflow-hidden',
    useFillMode: false,
    gap: '12px',
  },
}

export function getGridLayout(layout?: string): LayoutConfig {
  if (layout && layout in LAYOUTS) return LAYOUTS[layout as RoomLayout]
  return LAYOUTS.brutalist
}

const CYCLE: RoomLayout[] = ['brutalist', 'flow', 'void']

export function nextLayout(current?: string): RoomLayout {
  const idx = CYCLE.indexOf(current as RoomLayout)
  return CYCLE[(idx + 1) % CYCLE.length]
}

export const LAYOUT_LABELS: Record<RoomLayout, string> = {
  brutalist: 'grid',
  flow: 'flow',
  void: 'void',
}
