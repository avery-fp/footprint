'use client'

/**
 * FALLBACK CARD — deliberate link card for broken social embeds
 *
 * Spec: AE Presentation Layer — Task 3
 *
 * Renders when X / TikTok / Instagram embeds fail, thumbnails 404, or
 * there's no meaningful content to show. Never a gray box. Always an
 * intentional design choice using the ae dark-glass aesthetic.
 *
 * Philosophy: Footprint translates artifacts. This surface preserves
 * provenance (platform glyph + "open source ↗" affordance) without
 * embedding platform chrome.
 */

interface FallbackCardProps {
  // 'x' — not 'twitter'. Call sites map stored 'twitter' type → 'x' at the boundary.
  platform: 'x' | 'tiktok' | 'instagram'
  title?: string | null
  url: string
  aspectClass?: string
}

export default function FallbackCard({
  platform,
  title,
  url,
  aspectClass = 'aspect-square',
}: FallbackCardProps) {
  let hostname = ''
  try {
    hostname = new URL(url).hostname.replace('www.', '')
  } catch {}

  const displayTitle = title && title.trim().length > 0 ? title : hostname

  // Platform glyph — minimal, weight-300, matches existing Twitter text tile treatment
  const glyph =
    platform === 'x' ? (
      <span className="text-[13px] select-none" style={{ fontWeight: 300 }}>𝕏</span>
    ) : platform === 'tiktok' ? (
      <span className="text-[10px] tracking-[0.08em] uppercase select-none font-mono" style={{ fontWeight: 500 }}>TikTok</span>
    ) : (
      // Instagram — minimal camera glyph, not the logo
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
      </svg>
    )

  // Typographic scale — matches the existing Twitter text-only block (len-adaptive)
  const len = displayTitle.length
  const titleTypo =
    len <= 60
      ? 'text-[14px] tracking-[-0.01em] leading-snug'
      : len <= 140
      ? 'text-[12px] tracking-[-0.005em] leading-relaxed'
      : 'text-[11px] tracking-normal leading-relaxed'

  return (
    <div
      className={`block w-full h-full fp-tile overflow-hidden relative flex flex-col items-center justify-center p-5 ${aspectClass}`}
      style={{
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(22px) saturate(140%)',
        WebkitBackdropFilter: 'blur(22px) saturate(140%)',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
      }}
      data-fallback-platform={platform}
    >
      {/* Platform glyph — top-right, muted */}
      <div className="absolute top-2.5 right-3 text-white/25">{glyph}</div>

      {/* Title or hostname — center */}
      <p
        className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow line-clamp-4 ${titleTypo}`}
        style={{ fontWeight: 500 }}
      >
        {displayTitle}
      </p>

      {/* Open source affordance — bottom, muted */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/30 hover:text-white/60 transition-colors text-[10px] uppercase tracking-[0.08em]"
        style={{ fontWeight: 500 }}
      >
        open source ↗
      </a>
    </div>
  )
}
