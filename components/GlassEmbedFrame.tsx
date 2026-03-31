'use client'

import { useState } from 'react'

/**
 * GLASS EMBED FRAME
 *
 * Extracted from ContentCard.tsx. Universal frosted-glass wrapper for all
 * iframe embeds. Handles loading states and error fallback.
 */

// ── Glass styling constant ──────────────────────────────────

export const GLASS_STYLE: React.CSSProperties = {
  borderRadius: 'inherit',
  background: 'rgba(255, 255, 255, 0.06)',
  backdropFilter: 'blur(22px) saturate(140%)',
  WebkitBackdropFilter: 'blur(22px) saturate(140%)',
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
}

// ── Main component ──────────────────────────────────────────

interface GlassEmbedFrameProps {
  src: string
  height?: number
  allow?: string
  sandbox?: string
  allowFullScreen?: boolean
  /** Override referrer policy — default "no-referrer", YouTube/Spotify need "origin" */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy
  onError?: () => void
  onLoad?: () => void
  children?: React.ReactNode
}

export default function GlassEmbedFrame({
  src,
  height,
  allow,
  sandbox,
  allowFullScreen,
  // Do NOT use 'no-referrer' — YouTube Error 153 when origin is stripped
  referrerPolicy = 'strict-origin-when-cross-origin',
  onError,
  onLoad: onLoadCallback,
  children,
}: GlassEmbedFrameProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleLoad = () => {
    setLoaded(true)
    onLoadCallback?.()
  }

  const handleError = () => {
    setFailed(true)
    onError?.()
  }

  if (failed) {
    return (
      <div
        className="glass-embed-frame relative w-full h-full overflow-hidden flex items-center justify-center"
        style={{ ...GLASS_STYLE, ...(height ? { height: `${height}px` } : {}) }}
      >
        <span className="text-xs text-white/40 font-mono" style={{ opacity: 0.7 }}>
          embed unavailable
        </span>
      </div>
    )
  }

  return (
    <div
      className="glass-embed-frame relative w-full h-full overflow-hidden"
      style={{ ...GLASS_STYLE, ...(height ? { height: `${height}px` } : {}) }}
    >
      <iframe
        src={src}
        width="100%"
        height="100%"
        allow={allow}
        sandbox={sandbox}
        allowFullScreen={allowFullScreen}
        referrerPolicy={referrerPolicy}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          background: 'transparent',
          overflow: 'hidden',
          padding: 0,
          margin: 0,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 250ms ease-out',
        }}
      />
      {children}
    </div>
  )
}

// ── Placeholder ─────────────────────────────────────────────

export function GlassPlaceholder({
  height,
  aspectClass,
}: {
  height?: number
  aspectClass?: string
}) {
  return (
    <div
      className={`w-full h-full ${aspectClass || ''}`}
      style={{ ...GLASS_STYLE, ...(height ? { height: `${height}px` } : {}) }}
    />
  )
}
