'use client'

import { useEffect, useRef, useState } from 'react'
import { nudgeYouTubeQuality } from '@/lib/youtube-player'

/**
 * THEATER OVERLAY — fixed viewport-sized cinema fallback.
 *
 * When a cross-origin iframe can't enter native fullscreen (iOS Safari,
 * blocked permissions, rejected requestFullscreen), the caller mounts
 * this overlay instead. Same embed URL, same frame; the difference is
 * the surrounding chrome is ours, not the OS's.
 *
 * YouTube embeds: tile iframes load with mute=1 for reliable autoplay and
 * are unmuted via postMessage. This overlay re-runs that pattern on its
 * own iframe so focus mode has audio, and pauses sibling YouTube iframes
 * on mount so the tile behind the backdrop doesn't double-play.
 *
 * Contract:
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

const isYouTube = (url: string) => url.includes('youtube')

export default function TheaterOverlay({
  src,
  onClose,
  aspect = '16 / 9',
  allow = DEFAULT_ALLOW,
}: TheaterOverlayProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cursorVisible, setCursorVisible] = useState(true)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)

    // Pause any other YouTube iframes (typically the underlying tile) so
    // we don't get duplicate audio once our iframe unmutes.
    if (isYouTube(src)) {
      const own = iframeRef.current
      document.querySelectorAll<HTMLIFrameElement>('iframe').forEach((f) => {
        if (f === own || !isYouTube(f.src)) return
        try {
          f.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
            '*',
          )
        } catch {}
      })
    }

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [onClose, src])

  const revealCursor = () => {
    setCursorVisible(true)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => setCursorVisible(false), 1400)
  }

  const handleLoad = () => {
    if (!isYouTube(src)) return
    const iframe = iframeRef.current
    if (!iframe) return
    const post = (msg: Record<string, any>) => {
      try { iframe.contentWindow?.postMessage(JSON.stringify(msg), '*') } catch {}
    }
    post({ event: 'command', func: 'playVideo', args: '' })
    setTimeout(() => post({ event: 'command', func: 'playVideo', args: '' }), 250)
    setTimeout(() => post({ event: 'command', func: 'playVideo', args: '' }), 700)
    setTimeout(() => post({ event: 'command', func: 'playVideo', args: '' }), 1200)
    setTimeout(() => {
      post({ event: 'command', func: 'unMute', args: '' })
      post({ event: 'command', func: 'setVolume', args: [100] })
    }, 800)
    const nudgeQuality = () => nudgeYouTubeQuality(iframe)
    nudgeQuality()
    setTimeout(nudgeQuality, 300)
    setTimeout(nudgeQuality, 1000)
    setTimeout(nudgeQuality, 2500)
    setTimeout(nudgeQuality, 5000)
  }

  const frame =
    aspect === '9 / 16'
      ? { width: 'min(100vw, calc(100vh * 9 / 16))', height: 'min(100vh, calc(100vw * 16 / 9))' }
      : { width: 'min(100vw, calc(100vh * 16 / 9))', height: 'min(100vh, calc(100vw * 9 / 16))' }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onMouseMove={revealCursor}
      onMouseEnter={revealCursor}
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
        cursor: cursorVisible ? 'default' : 'none',
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
          ref={iframeRef}
          src={src}
          width={aspect === '16 / 9' ? 1920 : undefined}
          height={aspect === '16 / 9' ? 1080 : undefined}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow={allow}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleLoad}
        />
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex [@media(pointer:coarse)]:hidden"
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
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2147483647,
          border: 'none',
          cursor: 'pointer',
          opacity: cursorVisible ? 1 : 0,
          transition: 'opacity 180ms ease',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
