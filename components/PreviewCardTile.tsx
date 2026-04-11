'use client'

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
}

export default function PreviewCardTile({
  url,
  thumbnailUrl,
  title,
  subtitle,
}: PreviewCardTileProps) {
  // ── With thumbnail: visual card ──
  if (thumbnailUrl) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full relative overflow-hidden"
        style={{ borderRadius: 'inherit' }}
      >
        {/* Album art / thumbnail — full bleed */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />

        {/* Bottom gradient — text readability */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: '50%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}
        />

        {/* Title + subtitle overlay */}
        {(title || subtitle) && (
          <div className="absolute inset-x-0 bottom-0 z-10 p-4 flex flex-col items-center gap-1">
            {title && (
              <span
                className="text-white/70 truncate max-w-full text-center"
                style={{ fontSize: '13px', fontFamily: "'DM Sans', sans-serif" }}
              >
                {title}
              </span>
            )}
            {subtitle && (
              <span
                className="text-white/25 uppercase tracking-widest truncate max-w-full text-center"
                style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}
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
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {title && title !== 'Link' && (
        <span className="text-[11px] font-mono tracking-wider text-white/50 text-center truncate max-w-full">
          {title}
        </span>
      )}
    </a>
  )
}
