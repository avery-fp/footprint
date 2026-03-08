'use client'

import { LAYOUT_LABELS, nextLayout, type RoomLayout } from '@/lib/grid-layouts'

interface LayoutToggleProps {
  current: RoomLayout
  onToggle: (next: RoomLayout) => void
}

export default function LayoutToggle({ current, onToggle }: LayoutToggleProps) {
  return (
    <button
      onClick={() => onToggle(nextLayout(current))}
      className="text-xs font-mono px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/60 hover:text-white/90 transition"
      style={{ minHeight: '36px' }}
      title={`Layout: ${LAYOUT_LABELS[current]} — tap to change`}
    >
      {LAYOUT_LABELS[current]}
    </button>
  )
}
