'use client'

/**
 * TWITTER TILE — inline fitted post
 *
 * Renders the real X embed inside the tile cell, scoped to the cell's
 * aspect-class. Lazy-mounts widgets.js via IntersectionObserver so the
 * grid doesn't pay the script cost for off-screen tweets. No facade,
 * no shell — the post IS the tile.
 */

import { useEffect, useRef, useState } from 'react'
import SocialEmbed from '@/components/SocialEmbed'

interface TwitterTileProps {
  title: string
  authorHandle: string | null
  image: string | null
  url: string
  aspectClass?: string
  variant?: 'post' | 'profile'
}

export default function TwitterTile({
  title,
  authorHandle,
  url,
  aspectClass = 'aspect-square',
  variant = 'post',
}: TwitterTileProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const len = title.length
  const placeholderTypo =
    len <= 80
      ? 'text-[14px] leading-snug'
      : len <= 180
      ? 'text-[12px] leading-relaxed'
      : 'text-[11px] leading-relaxed'

  return (
    <div
      ref={ref}
      className={`block w-full h-full fp-tile overflow-hidden relative ${aspectClass}`}
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Real X post — fitted, scrolls inside the cell when taller than aspect */}
      {inView && (
        <div
          className="absolute inset-0 overflow-y-auto overflow-x-hidden"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex justify-center">
            <SocialEmbed
              url={url}
              type="twitter"
              variant={variant}
              onLoad={() => setLoaded(true)}
            />
          </div>
        </div>
      )}

      {/* Glass placeholder — replaced once the iframe inserts */}
      {!loaded && (
        <div
          className="absolute inset-0 pointer-events-none flex flex-col justify-center px-4 py-3 gap-2"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(22px) saturate(140%)',
            WebkitBackdropFilter: 'blur(22px) saturate(140%)',
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-white/55 truncate"
              style={{ fontSize: '11px', fontWeight: 500 }}
            >
              {authorHandle || ''}
            </span>
            <span
              className="text-white/35 shrink-0 ml-2 select-none"
              style={{ fontSize: '13px', fontWeight: 300 }}
            >
              𝕏
            </span>
          </div>
          <p
            className={`text-white/80 whitespace-pre-wrap line-clamp-6 ${placeholderTypo}`}
            style={{ fontWeight: 500 }}
          >
            {title}
          </p>
        </div>
      )}
    </div>
  )
}
