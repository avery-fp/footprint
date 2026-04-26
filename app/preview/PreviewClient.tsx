'use client'

import type { Theme } from '@/lib/themes'
import { AUTH_ENTRY, withParams } from '@/lib/routes'

/**
 * PREVIEW TEMPLATE — shows what a footprint COULD look like.
 *
 * Used in ARO emails: footprint.onl/preview?name=Sal's Pizza&city=Brooklyn
 * Not a real page. A ghost plate — illuminated, waiting to be claimed.
 *
 * Shows: name as masthead, ghost glass tiles (dimmed, pulsing),
 * a ghost serial number, and a prominent claim CTA.
 */

// Ghost tile grid — matches real tile proportions and glass treatment
const GHOST_TILES = [
  { span: 2, aspect: 'aspect-video' },
  { span: 1, aspect: 'aspect-square' },
  { span: 1, aspect: 'aspect-square' },
  { span: 1, aspect: 'aspect-square' },
  { span: 1, aspect: 'aspect-square' },
  { span: 2, aspect: 'aspect-video' },
]

interface PreviewClientProps {
  name: string
  city: string
  category: string
  theme: Theme
  themeId: string
}

export default function PreviewClient({ name, city, category, theme, themeId }: PreviewClientProps) {
  // Derive slug suggestion from name
  const suggestedSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)

  // Subtitle from city + category
  const subtitle = [city, category].filter(Boolean).join(' \u00b7 ')

  // Dark theme detection
  const isDark = theme.colors.background.includes('#0') || theme.colors.background.includes('rgba(5') || theme.colors.background.includes('rgba(0') || theme.colors.background.includes('rgba(15')

  return (
    <div
      className="min-h-[100dvh] relative flex flex-col"
      style={{
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.02) 0%, transparent 70%)'
            : 'radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.02) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Sky */}
        <div style={{ height: '100px' }} />

        {/* Masthead */}
        <header className="pb-2 flex flex-col items-center px-4">
          <h1
            className={`${
              name.length <= 6
                ? 'text-4xl md:text-6xl tracking-[0.22em] font-normal'
                : name.length <= 12
                ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
            }`}
            style={{ opacity: 0.92 }}
          >
            {name}
          </h1>
          {subtitle && (
            <p
              className="mt-2 font-mono tracking-widest uppercase"
              style={{
                fontSize: '10px',
                opacity: 0.3,
              }}
            >
              {subtitle}
            </p>
          )}
        </header>

        {/* Ghost space nav */}
        <div className="flex items-center justify-center mt-4 mb-6 px-4">
          <div className="flex items-center gap-0 font-mono">
            {['work', 'links', 'about'].map((space, i) => (
              <span key={space} className="flex items-center whitespace-nowrap">
                {i > 0 && (
                  <span className="mx-2.5" style={{ fontSize: '8px', opacity: 0.2 }}>{'\u00b7'}</span>
                )}
                <span
                  style={{
                    fontSize: '11px',
                    letterSpacing: '2.5px',
                    textTransform: 'lowercase',
                    fontWeight: i === 0 ? 400 : 300,
                    opacity: i === 0 ? 0.7 : 0.25,
                  }}
                >
                  {space}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Ghost tile grid — real proportions, dark glass, faint pulse */}
        <div className="mx-auto w-full px-3 md:px-4" style={{ maxWidth: '880px' }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {GHOST_TILES.map((tile, idx) => (
              <div
                key={idx}
                className={`${tile.span === 2 ? 'col-span-2' : 'col-span-1'} ${tile.aspect} relative overflow-hidden rounded-2xl animate-ghost-pulse`}
                style={{
                  background: theme.colors.glass,
                  border: `1px solid ${theme.colors.border}`,
                  animationDelay: `${idx * 1.2}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-[60px]" />

        {/* Claim CTA — the conversion point */}
        <div className="flex flex-col items-center gap-4 pb-10 px-4">
          <a
            href={withParams(AUTH_ENTRY, { ref: 'preview', name, city })}
            className="inline-flex items-center touch-manipulation"
            style={{
              padding: '14px 32px',
              background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: '9999px',
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text,
              fontSize: '14px',
              fontWeight: 400,
              letterSpacing: '0.08em',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
            }}
          >
            →
          </a>
          <p
            className="font-mono text-center"
            style={{ fontSize: '11px', opacity: 0.2 }}
          >
            footprint.onl/{suggestedSlug || 'yours'} {'\u00b7'} free forever
          </p>
        </div>
      </div>

      {/* Ghost serial — unclaimed, waiting */}
      <div
        className="fixed bottom-4 left-4 select-none pointer-events-none font-mono"
        style={{
          color: theme.colors.textMuted,
          fontSize: '11px',
          fontWeight: 300,
          opacity: 0.2,
        }}
      >
        #????
      </div>

      {/* Preview badge */}
      <div
        className="fixed top-5 left-4 select-none pointer-events-none font-mono tracking-[0.12em] uppercase"
        style={{
          fontSize: '9px',
          opacity: 0.2,
          color: theme.colors.textMuted,
        }}
      >
        preview
      </div>
    </div>
  )
}
