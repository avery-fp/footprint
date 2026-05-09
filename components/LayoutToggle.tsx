'use client'

import { LAYOUT_LABELS, type RoomLayout } from '@/lib/grid-layouts'

interface LayoutToggleProps {
  current: RoomLayout
  onToggle: (next: RoomLayout) => void
}

const LAYOUTS: RoomLayout[] = ['grid', 'horizontal']

function GridIcon() {
  // Pinterest-style masonry hint — uniform widths, varying heights.
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="currentColor">
      <rect x="0" y="0" width="6" height="8" rx="1" />
      <rect x="8" y="0" width="6" height="5" rx="1" />
      <rect x="0" y="10" width="6" height="4" rx="1" />
      <rect x="8" y="7" width="6" height="7" rx="1" />
    </svg>
  )
}

function HorizontalIcon() {
  // A row of variable-width tiles at one fixed height.
  return (
    <svg width={16} height={14} viewBox="0 0 16 14" fill="currentColor">
      <rect x="0" y="2" width="4" height="10" rx="1" />
      <rect x="5" y="2" width="6" height="10" rx="1" />
      <rect x="12" y="2" width="3" height="10" rx="1" />
    </svg>
  )
}

const ICONS: Record<RoomLayout, React.ReactNode> = {
  grid: <GridIcon />,
  horizontal: <HorizontalIcon />,
}

export default function LayoutToggle({ current, onToggle }: LayoutToggleProps) {
  return (
    <div className="flex items-center gap-0.5">
      {LAYOUTS.map((l) => (
        <button
          key={l}
          onClick={() => onToggle(l)}
          aria-label={LAYOUT_LABELS[l]}
          title={LAYOUT_LABELS[l]}
          className="p-1.5 rounded-md transition-opacity"
          style={{
            color: 'white',
            opacity: current === l ? 1 : 0.3,
          }}
          onMouseEnter={(e) => { if (current !== l) (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
          onMouseLeave={(e) => { if (current !== l) (e.currentTarget as HTMLElement).style.opacity = '0.3' }}
        >
          {ICONS[l]}
        </button>
      ))}
    </div>
  )
}
