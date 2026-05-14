'use client'

import { useEffect } from 'react'

/**
 * THEATER OVERLAY — fixed viewport-sized cinema fallback.
 *
 * When a cross-origin iframe can't enter native fullscreen (iOS Safari,
 * blocked permissions, rejected requestFullscreen), the caller mounts
 * this overlay instead. Same embed URL, same frame; the difference is
 * the surrounding chrome is ours, not the OS's.
 *
 * Contract:
 *   - Caller pauses the underlying tile's player before opening (no
 *     duplicate audio).
 *   - Locks body scroll while mounted.
 *   - Closes on Escape, backdrop tap, or close button.
 *   - 16:9 frame centered in the viewport; portrait clip URLs (TikTok,
 *     IG Reels) can pass aspect="9 / 16" to flip the frame.
 */
interface TheaterOverlayProps {
  src: string
  onClose: () => void
  aspect?: '16 / 9' | '9 / 16'
  allow?: string
}

const DEFAULT_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'

export default function TheaterOverlay({
  src,
  onClose,
  aspect = '16 / 9',
  allow = DEFAULT_ALLOW,
}: TheaterOverlayProps) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const frame =
    aspect === '9 / 16'
      ? { width: 'min(100vw, calc(100vh * 9 / 16))', height: 'min(100vh, calc(100vw * 16 / 9))' }
      : { width: 'min(100vw, calc(100vh * 16 / 9))', height: 'min(100vh, calc(100vw * 9 / 16))' }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(20px) brightness(0.5)',
        WebkitBackdropFilter: 'blur(20px) brightness(0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          ...frame,
          maxWidth: '100vw',
          maxHeight: '100vh',
        }}
      >
        <iframe
          src={src}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow={allow}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 'max(12px, env(safe-area-inset-top))',
          right: 'max(12px, env(safe-area-inset-right))',
          width: 40,
          height: 40,
          borderRadius: 999,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2147483647,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
