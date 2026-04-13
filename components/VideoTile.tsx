'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { audioManager } from '@/lib/audio-manager'
import { MOTION } from '@/lib/motion'
import { useVideoExpansion } from '@/hooks/useVideoExpansion'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import VideoScrubBar from '@/components/VideoScrubBar'
import FieldBackground from '@/components/FieldBackground'
import Hls from 'hls.js'

interface VideoTileProps {
  src: string
  playbackUrl?: string | null
  posterUrl?: string | null
  status?: string | null
  onWidescreen?: () => void
}

export default function VideoTile({ src, playbackUrl, posterUrl, status, onWidescreen }: VideoTileProps) {
  const [isMuted, setIsMuted] = useState(true)
  const [isNear, setIsNear] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const [showTapFeedback, setShowTapFeedback] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoWrapperRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const theatreContainerRef = useRef<HTMLDivElement>(null)
  const videoId = useRef(`video-${src}-${Math.random()}`).current
  const reducedMotion = useReducedMotion()

  const { mode, escalate, collapse, isExpanded } = useVideoExpansion(theatreContainerRef)

  // The actual source to play — prefer HLS playback URL when ready
  const effectiveSrc = (status === 'ready' && playbackUrl) ? playbackUrl : src

  // Two observers: one for "near" (load metadata), one for "visible" (play)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const nearObs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsNear(true) },
      { rootMargin: '200px' }
    )
    const visObs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '0px' }
    )
    nearObs.observe(el)
    visObs.observe(el)
    return () => { nearObs.disconnect(); visObs.disconnect() }
  }, [])

  // HLS setup — attach hls.js for non-Safari browsers when we have an HLS URL
  useEffect(() => {
    const v = videoRef.current
    if (!v || !effectiveSrc) return

    const isHls = effectiveSrc.includes('.m3u8')

    if (isHls) {
      // Safari handles HLS natively
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = effectiveSrc
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, startLevel: -1 })
        hls.loadSource(effectiveSrc)
        hls.attachMedia(v)
        hlsRef.current = hls
        return () => {
          hls.destroy()
          hlsRef.current = null
        }
      }
    } else {
      // Raw src — legacy path
      v.src = effectiveSrc
    }
  }, [effectiveSrc])

  // Play only when visible (or expanded), pause when off-screen.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let cancelled = false
    const unlock = () => {
      if (cancelled || !videoRef.current) return
      videoRef.current.muted = false
      setIsMuted(false)
      audioManager.play(videoId)
      cleanup()
    }
    const cleanup = () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
    // When expanded, always play regardless of IntersectionObserver
    const shouldPlay = isExpanded || isVisible
    if (shouldPlay) {
      v.play().then(() => {
        if (cancelled) return
        v.muted = false
        setIsMuted(false)
        audioManager.play(videoId)
      }).catch(() => {
        if (cancelled) return
        document.addEventListener('click', unlock, { once: true })
        document.addEventListener('touchstart', unlock, { once: true })
      })
    } else {
      v.pause()
    }
    return () => {
      cancelled = true
      cleanup()
    }
  }, [isVisible, isReady, isExpanded, videoId])

  // Loop control: loop in tile mode, no loop in theatre/fullscreen
  useEffect(() => {
    const v = videoRef.current
    if (v) v.loop = mode === 'tile'
  }, [mode])

  // DOM transfer: move video wrapper into theatre portal when expanded
  useEffect(() => {
    const wrapper = videoWrapperRef.current
    const grid = containerRef.current
    const theatre = theatreContainerRef.current
    if (!wrapper || !grid || !theatre) return

    if (isExpanded) {
      theatre.appendChild(wrapper)
    } else {
      grid.appendChild(wrapper)
    }
  }, [isExpanded])

  // Timeout — if video doesn't load in 8s, show fallback
  useEffect(() => {
    if (!isNear || status === 'processing') return
    const timer = setTimeout(() => {
      if (!isReady) setHasFailed(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [isNear, isReady, status])

  // Register with audio manager
  useEffect(() => {
    if (!isNear) return
    audioManager.register(videoId, () => {
      if (videoRef.current) {
        videoRef.current.muted = true
        setIsMuted(true)
      }
    })
    return () => audioManager.unregister(videoId)
  }, [videoId, isNear])

  const handleClick = useCallback(() => {
    if (videoRef.current) {
      setShowTapFeedback(true)
      setTimeout(() => setShowTapFeedback(false), 400)

      if (isMuted) {
        audioManager.play(videoId)
        videoRef.current.muted = false
        setIsMuted(false)
      } else {
        audioManager.mute(videoId)
        videoRef.current.muted = true
        setIsMuted(true)
      }
    }
  }, [isMuted, videoId])

  // Swipe-down detection for theatre dismiss
  const swipeRef = useRef<{ y: number; t: number } | null>(null)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isExpanded) return
    swipeRef.current = { y: e.touches[0].clientY, t: Date.now() }
  }, [isExpanded])
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current || !isExpanded) return
    const dy = e.changedTouches[0].clientY - swipeRef.current.y
    const dt = Date.now() - swipeRef.current.t
    swipeRef.current = null
    if (dy > 80 && dt < 400) collapse()
  }, [isExpanded, collapse])

  const { theatre } = MOTION

  // ── Processing state — poster frame + shimmer ──
  if (status === 'processing' || status === 'uploading') {
    return (
      <div
        ref={containerRef}
        className="relative w-full h-full aspect-video overflow-hidden"
      >
        {posterUrl ? (
          <img src={posterUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: 'rgba(0,0,0,0.3)' }} />
        )}
        {/* Shimmer overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s ease-in-out infinite',
          }}
        />
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    )
  }

  if (hasFailed) {
    return (
      <div
        ref={containerRef}
        className="relative w-full h-full"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', minHeight: '200px' }}
      />
    )
  }

  // ── Theatre/fullscreen overlay (portal to body) ──
  const theatreOverlay = isExpanded && typeof document !== 'undefined' ? createPortal(
    <>
      {/* Field backdrop — blurred poster aura behind the video */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: 40,
          transition: reducedMotion ? 'none' : `opacity ${theatre.backdrop}`,
          opacity: 1,
        }}
        onClick={collapse}
      >
        <FieldBackground imageUrl={posterUrl} intensity="theatre" />
        {/* Fallback scrim — darker when no poster available */}
        <div
          className="absolute inset-0"
          style={{ background: posterUrl ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.65)' }}
        />
      </div>
      {/* Theatre container — video gets DOM-moved here */}
      <div
        ref={theatreContainerRef}
        className="fixed inset-0 flex items-center justify-center"
        style={{
          zIndex: 50,
          pointerEvents: 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* VideoScrubBar renders inside the wrapper via the video wrapper */}
      </div>
    </>,
    document.body,
  ) : null

  // Hidden theatre container ref when not expanded (so the ref is always mountable)
  const theatreRefHolder = !isExpanded ? (
    <div ref={theatreContainerRef} style={{ display: 'none' }} />
  ) : null

  return (
    <>
      <div ref={containerRef} className="relative w-full h-full aspect-video">
        {isNear ? (
          <>
            {/* Video wrapper — this div gets DOM-moved between grid slot and theatre */}
            <div
              ref={videoWrapperRef}
              className="relative"
              style={{
                width: '100%',
                height: '100%',
                pointerEvents: 'auto',
                ...(isExpanded ? {
                  maxWidth: '85vw',
                  maxHeight: '82vh',
                  width: '85vw',
                  height: '82vh',
                  borderRadius: '16px',
                  overflow: 'hidden',
                } : {}),
                transition: reducedMotion ? 'none' : `all ${isExpanded ? theatre.enter : theatre.exit}`,
              }}
            >
              <video
                ref={videoRef}
                className="w-full h-full cursor-pointer"
                style={{ objectFit: isExpanded ? 'contain' : 'cover' }}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster={posterUrl || undefined}
                onClick={handleClick}
                onError={() => setHasFailed(true)}
                onLoadedData={() => setIsReady(true)}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  if (v.videoWidth > v.videoHeight * 1.3) {
                    onWidescreen?.()
                  }
                }}
              />

              {/* Brief play/pause tap feedback */}
              {showTapFeedback && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ animation: 'fadeIn 400ms ease-out forwards' }}>
                  <div className="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center backdrop-blur-sm">
                    <svg className="w-4 h-4 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                      {isMuted ? (
                        <path d="M8 5v14l11-7z"/>
                      ) : (
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      )}
                    </svg>
                  </div>
                </div>
              )}

              {/* Unmuted indicator dot — tile mode only */}
              {!isMuted && isReady && !isExpanded && (
                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60" />
              )}

              {/* Scrub bar — theatre/fullscreen only */}
              {isExpanded && (
                <VideoScrubBar videoRef={videoRef} />
              )}

              {/* Maximize button */}
              {isReady && mode !== 'fullscreen' && (
                <button
                  className="absolute group/btn"
                  style={{
                    bottom: isExpanded ? '32px' : '6px',
                    right: '6px',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    background: isExpanded ? 'rgba(0,0,0,0.3)' : 'transparent',
                    backdropFilter: isExpanded ? 'blur(8px)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: isExpanded ? 0.7 : 0,
                    transition: 'opacity 0.2s ease, background 0.2s ease',
                    zIndex: 11,
                    padding: 0,
                  }}
                  onClick={(e) => { e.stopPropagation(); escalate() }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.8' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = isExpanded ? '0.7' : '0' }}
                  onTouchStart={(e) => {
                    e.stopPropagation()
                    ;(e.currentTarget as HTMLElement).style.opacity = '0.8'
                  }}
                  aria-label={mode === 'tile' ? 'Theatre mode' : 'Fullscreen'}
                >
                  {mode === 'tile' ? (
                    // Expand icon — two diagonal arrows
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/80">
                      <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    // Fullscreen icon — corner brackets
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/80">
                      <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="4" y="4" width="6" height="6" rx="0.5" strokeWidth="1"/>
                    </svg>
                  )}
                </button>
              )}
            </div>

            {/* Placeholder when video is moved to theatre */}
            {isExpanded && (
              <div
                className="w-full h-full"
                style={{
                  background: posterUrl ? `url(${posterUrl}) center/cover` : 'rgba(0,0,0,0.3)',
                }}
              />
            )}
          </>
        ) : (
          <div
            className="w-full h-full"
            style={{ background: 'rgba(0,0,0,0.3)', minHeight: '200px' }}
          />
        )}
      </div>
      {theatreOverlay}
      {theatreRefHolder}
    </>
  )
}
