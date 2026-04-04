'use client'

import { useState, useEffect } from 'react'
import type { Theme } from '@/lib/themes'

/**
 * PREVIEW TEMPLATE — shows what a footprint COULD look like.
 *
 * Used in ARO emails: fp.onl/preview?name=Sal's Pizza&city=Brooklyn
 * Not a real page. A ghost plate — illuminated, waiting to be claimed.
 *
 * Shows: name as masthead, placeholder tiles (glass squares),
 * a ghost serial number, and a prominent "claim this" CTA.
 */

// Placeholder tile content — suggests what could go here
const PLACEHOLDER_TILES = [
  { label: 'your work', icon: 'image', span: 2 },
  { label: 'links', icon: 'link', span: 1 },
  { label: 'video', icon: 'play', span: 1 },
  { label: 'music', icon: 'music', span: 1 },
  { label: 'social', icon: 'at', span: 1 },
  { label: 'shop', icon: 'bag', span: 2 },
]

function TileIcon({ type, className }: { type: string; className?: string }) {
  const cn = className || 'w-5 h-5'
  switch (type) {
    case 'image':
      return <svg className={cn} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
    case 'link':
      return <svg className={cn} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.97" /></svg>
    case 'play':
      return <svg className={cn} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
    case 'music':
      return <svg className={cn} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="m9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
    case 'at':
      return <svg className={cn} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-5.636 8.328" /></svg>
    case 'bag':
      return <svg className={cn} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
    default:
      return <svg className={cn} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
  }
}

interface PreviewClientProps {
  name: string
  city: string
  category: string
  theme: Theme
  themeId: string
}

export default function PreviewClient({ name, city, category, theme, themeId }: PreviewClientProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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
            style={{
              opacity: 0.92,
              transition: 'opacity 0.5s ease',
            }}
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

        {/* Ghost room nav */}
        <div className="flex items-center justify-center mt-4 mb-6 px-4">
          <div className="flex items-center gap-0 font-mono">
            {['work', 'links', 'about'].map((room, i) => (
              <span key={room} className="flex items-center whitespace-nowrap">
                {i > 0 && (
                  <span className="mx-2.5" style={{ fontSize: '8px', opacity: 0.2 }}>\u00b7</span>
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
                  {room}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Ghost tile grid */}
        <div className="mx-auto w-full px-3 md:px-4" style={{ maxWidth: '880px' }}>
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
            style={{
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.8s ease 0.2s',
            }}
          >
            {PLACEHOLDER_TILES.map((tile, idx) => (
              <div
                key={idx}
                className={`${tile.span === 2 ? 'col-span-2 aspect-video' : 'col-span-1 aspect-square'} relative overflow-hidden rounded-2xl flex flex-col items-center justify-center gap-2`}
                style={{
                  background: theme.colors.glass,
                  border: `1px solid ${theme.colors.border}`,
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                  transition: `opacity 0.5s ease ${0.15 + idx * 0.08}s, transform 0.5s ease ${0.15 + idx * 0.08}s`,
                }}
              >
                <TileIcon type={tile.icon} className="w-5 h-5" />
                <span
                  className="font-mono tracking-widest uppercase"
                  style={{ fontSize: '9px', opacity: 0.4 }}
                >
                  {tile.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-[60px]" />

        {/* Claim CTA — the conversion point */}
        <div
          className="flex flex-col items-center gap-4 pb-10 px-4"
          style={{
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.6s ease 0.8s',
          }}
        >
          <p
            className="font-mono tracking-widest uppercase text-center"
            style={{ fontSize: '10px', opacity: 0.3 }}
          >
            this could be yours
          </p>
          <a
            href={`/signup?ref=preview&name=${encodeURIComponent(name)}${city ? `&city=${encodeURIComponent(city)}` : ''}`}
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
            claim footprint.onl/{suggestedSlug || 'yours'}
          </a>
          <p
            className="font-mono text-center"
            style={{ fontSize: '11px', opacity: 0.2 }}
          >
            free forever \u00b7 one page for everything
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

      {/* footprint badge */}
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
