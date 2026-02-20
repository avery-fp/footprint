'use client'

import { useState, useEffect } from 'react'

interface Template {
  id: string
  name: string
  label: string
  bg: string
  accent: string
  preview: string
  tiles: string[]
}

const TEMPLATES: Template[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    label: 'clean lines, nothing extra',
    bg: '#080808',
    accent: '#F5F5F5',
    preview: 'linear-gradient(135deg, #111 0%, #080808 100%)',
    tiles: [],
  },
  {
    id: 'a24',
    name: 'A24',
    label: 'cinematic, moody, textural',
    bg: '#0C0A08',
    accent: '#C8B89A',
    preview: 'linear-gradient(135deg, #1A1612 0%, #0C0A08 100%)',
    tiles: [],
  },
  {
    id: 'creator',
    name: 'Creator',
    label: 'links, content, everything',
    bg: '#0A0A0F',
    accent: '#8B8BF5',
    preview: 'linear-gradient(135deg, #12121F 0%, #0A0A0F 100%)',
    tiles: [],
  },
  {
    id: 'streetwear',
    name: 'Streetwear',
    label: 'bold, graphic, no rules',
    bg: '#0A0A0A',
    accent: '#FF4444',
    preview: 'linear-gradient(135deg, #1A0808 0%, #0A0A0A 100%)',
    tiles: [],
  },
  {
    id: 'music',
    name: 'Music',
    label: 'playlists, albums, vibes',
    bg: '#060810',
    accent: '#4ADE80',
    preview: 'linear-gradient(135deg, #0A1018 0%, #060810 100%)',
    tiles: [],
  },
]

interface TemplatePickerProps {
  onSelect: (template: Template) => void
  selected?: string
}

const DM = "'DM Sans', sans-serif"

export default function TemplatePicker({ onSelect, selected }: TemplatePickerProps) {
  const [active, setActive] = useState(selected || 'minimal')

  return (
    <div className="w-full">
      <p
        className="text-white/30 text-xs mb-4 text-center"
        style={{ fontFamily: DM }}
      >
        pick a vibe
      </p>

      <div className="flex gap-3 overflow-x-auto pb-4 px-1 no-scrollbar snap-x snap-mandatory">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActive(t.id)
              onSelect(t)
            }}
            className={`flex-shrink-0 snap-center w-36 rounded-2xl overflow-hidden transition-all duration-300 ${
              active === t.id
                ? 'ring-1 ring-white/30 scale-[1.02]'
                : 'ring-1 ring-white/[0.06] hover:ring-white/15'
            }`}
          >
            {/* Preview swatch */}
            <div
              className="h-24 w-full relative"
              style={{ background: t.preview }}
            >
              {/* Mini grid dots */}
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 p-4">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded"
                    style={{
                      backgroundColor: t.accent,
                      opacity: active === t.id ? 0.4 : 0.15,
                      transition: 'opacity 0.3s',
                    }}
                  />
                ))}
              </div>
              {/* Accent line */}
              <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ backgroundColor: t.accent, opacity: 0.2 }}
              />
            </div>

            {/* Label */}
            <div className="p-3 bg-white/[0.02]">
              <p
                className="text-white/80 text-xs font-medium mb-0.5 text-left"
                style={{ fontFamily: DM }}
              >
                {t.name}
              </p>
              <p
                className="text-white/25 text-[10px] text-left leading-tight"
                style={{ fontFamily: DM }}
              >
                {t.label}
              </p>
            </div>
          </button>
        ))}
      </div>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}
