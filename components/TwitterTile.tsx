'use client'

/**
 * TWITTER TILE — glass, compact, click-to-expand
 *
 * Resting state: a frosted-glass card that shows the tweet text + author
 * handle (and a small media thumb if the tweet had one). No full-bleed
 * dark backdrop, no orphaned empty space.
 *
 * On tap: ArtifactShell pulls forward with the real XEmbed (post URLs)
 * or TwitterTimeline (profile URLs) — same pattern as TikTok/Instagram.
 */

import { useState } from 'react'
import ArtifactShell from '@/components/ArtifactShell'
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
  image,
  url,
  aspectClass = 'aspect-square',
  variant = 'post',
}: TwitterTileProps) {
  const [shellOpen, setShellOpen] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!image && !imgFailed

  const len = title.length
  const titleTypo = showImage
    ? 'text-[12px] tracking-[-0.005em] leading-snug'
    : len <= 80
    ? 'text-[14px] tracking-[-0.01em] leading-snug'
    : len <= 180
    ? 'text-[12px] tracking-[-0.005em] leading-relaxed'
    : 'text-[11px] tracking-normal leading-relaxed'

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShellOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setShellOpen(true)
          }
        }}
        className={`block w-full h-full fp-tile overflow-hidden relative cursor-pointer group ${aspectClass}`}
        style={{
          background: 'rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(22px) saturate(140%)',
          WebkitBackdropFilter: 'blur(22px) saturate(140%)',
          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Header — author handle + X glyph, compact */}
        <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between z-[2]">
          <span
            className="text-white/55 truncate"
            style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '-0.005em' }}
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

        {showImage ? (
          /* ── With media: thumb + caption stacked, dense ── */
          <div className="absolute inset-0 pt-9 pb-7 px-3 flex flex-col gap-2">
            <div
              className="w-full overflow-hidden rounded-md relative"
              style={{ flex: '1 1 60%', background: 'rgba(0,0,0,0.2)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image!}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                onError={() => setImgFailed(true)}
              />
            </div>
            <p
              className={`text-white/85 line-clamp-3 whitespace-pre-wrap ${titleTypo}`}
              style={{ fontWeight: 500, flex: '0 0 auto' }}
            >
              {title}
            </p>
          </div>
        ) : (
          /* ── Text-only: tweet centered, breathing room minimal ── */
          <div className="absolute inset-0 pt-9 pb-7 px-4 flex items-center">
            <p
              className={`text-white/85 whitespace-pre-wrap line-clamp-6 ${titleTypo}`}
              style={{ fontWeight: 500 }}
            >
              {title}
            </p>
          </div>
        )}

        {/* Affordance — subtle expand hint, brightens on hover */}
        <span
          className="absolute bottom-2.5 left-1/2 -translate-x-1/2 text-white/25 group-hover:text-white/60 transition-colors duration-200 select-none"
          style={{
            fontSize: '9px',
            fontWeight: 500,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          expand →
        </span>
      </div>

      {shellOpen && (
        <ArtifactShell onDismiss={() => setShellOpen(false)} fallbackUrl={url}>
          <SocialEmbed
            url={url}
            type="twitter"
            variant={variant}
            onError={() => setShellOpen(false)}
          />
        </ArtifactShell>
      )}
    </>
  )
}
