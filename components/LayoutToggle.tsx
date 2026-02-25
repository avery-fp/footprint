'use client'

import type { LayoutMode } from '@/lib/layout-engine'

interface LayoutToggleProps {
  mode: LayoutMode
  onChange: (mode: LayoutMode) => void
}

const MODES: { mode: LayoutMode; icon: React.ReactNode; label: string }[] = [
  {
    mode: 'editorial',
    label: 'Editorial',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="5" rx="0.5" fill="currentColor" />
        <rect x="1" y="8" width="5.5" height="5" rx="0.5" fill="currentColor" />
        <rect x="8" y="8" width="5" height="5" rx="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    mode: 'breathe',
    label: 'Breathe',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1.5" y="1.5" width="11" height="4" rx="1.5" fill="currentColor" />
        <rect x="1.5" y="7.5" width="4.5" height="5" rx="1.5" fill="currentColor" />
        <rect x="8" y="7.5" width="4.5" height="5" rx="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    mode: 'grid',
    label: 'Grid',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
        <rect x="5.5" y="1" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
        <rect x="10" y="1" width="3" height="3.5" rx="0.5" fill="currentColor" />
        <rect x="1" y="5.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
        <rect x="5.5" y="5.5" width="3.5" height="3.5" rx="0.5" fill="currentColor" />
        <rect x="10" y="5.5" width="3" height="3.5" rx="0.5" fill="currentColor" />
        <rect x="1" y="10" width="3.5" height="3" rx="0.5" fill="currentColor" />
        <rect x="5.5" y="10" width="3.5" height="3" rx="0.5" fill="currentColor" />
        <rect x="10" y="10" width="3" height="3" rx="0.5" fill="currentColor" />
      </svg>
    ),
  },
]

export default function LayoutToggle({ mode, onChange }: LayoutToggleProps) {
  return (
    <div className="flex items-center">
      {MODES.map(({ mode: m, icon, label }) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-label={label}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: mode === m ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)',
            transition: 'color 200ms ease',
          }}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}
