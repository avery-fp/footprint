'use client'

import { applyNextThumbnailFallback, applyThumbnailLoadGuard } from '@/lib/media/thumbnails'

/**
 * PREVIEW CARD TILE — Universal fallback rendering
 *
 * The one tile to rule them all when native/embed rendering isn't available.
 *
 * With thumbnail: full-bleed image + bottom gradient + title/subtitle overlay
 * Without thumbnail: frosted glass card + centered title
 *
 * Tap opens URL in new tab. Never shows broken states.
 */

interface PreviewCardTileProps {
  url: string
  thumbnailUrl: string | null
  title: string | null
  subtitle: string | null
  cropThumbnail?: boolean
  thumbnailCandidates?: string[]
}

export default function PreviewCardTile({
  url,
  thumbnailUrl,
  title,
  subtitle,
  cropThumbnail = false,
  thumbnailCandidates = [],
}: PreviewCardTileProps) {
  const candidates = thumbnailCandidates.length > 0 ? thumbnailCandidates : thumbnailUrl ? [thumbnailUrl] : []
  const thumbSrc = candidates[0] || thumbnailUrl

  // ── With thumbnail: visual card ──
  if (thumbSrc) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full relative overflow-hidden"
        style={{ borderRadius: 'inherit' }}
      >
        <div className={cropThumbnail ? 'fp-resting-video-frame' : 'absolute inset-0'}>
          {/* Album art / thumbnail — full bleed */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbSrc}
            alt=""
            className={cropThumbnail ? 'fp-resting-video-media' : 'absolute inset-0 w-full h-full object-cover'}
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              applyThumbnailLoadGuard(e.currentTarget, candidates)
            }}
            onError={(e) => {
              applyNextThumbnailFallback(e.currentTarget, candidates)
            }}
          />
        </div>

        {/* Bottom gradient — text readability */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: '55%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}
        />

        {/* Title + subtitle overlay */}
        {(title || subtitle) && (
          <div className="absolute inset-x-0 bottom-0 z-10 p-4 flex flex-col items-center gap-0.5">
            {title && (
              <span
                className="text-white/80 line-clamp-2 text-center fp-text-shadow"
                style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.35 }}
              >
                {title}
              </span>
            )}
            {subtitle && (
              <span
                className="text-white/40 uppercase tracking-widest truncate max-w-full text-center font-mono"
                style={{ fontSize: '9px', fontWeight: 500, lineHeight: 1.2 }}
              >
                {subtitle}
              </span>
            )}
          </div>
        )}
      </a>
    )
  }

  // ── Without thumbnail: frosted glass ──
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full h-full flex flex-col items-center justify-center p-4"
      style={{
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px) saturate(120%)',
        WebkitBackdropFilter: 'blur(20px) saturate(120%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 'inherit',
      }}
    >
      {title && title !== 'Link' && (
        <span
          className="text-[11px] tracking-wider text-white/60 text-center line-clamp-2"
          style={{ fontWeight: 500, lineHeight: 1.35 }}
        >
          {title}
        </span>
      )}
    </a>
  )
}
