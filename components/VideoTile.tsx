'use client'

import { useState, useRef, useEffect } from 'react'
import { audioManager } from '@/lib/audio-manager'
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
  const hlsRef = useRef<Hls | null>(null)
  const videoId = useRef(`video-${src}-${Math.random()}`).current

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

  // Play only when visible, pause when off-screen.
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
    if (isVisible) {
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
  }, [isVisible, isReady, videoId])

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

  const handleClick = () => {
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
  }

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

  return (
    <div ref={containerRef} className="relative w-full h-full aspect-video">
      {isNear ? (
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-cover cursor-pointer"
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
          {/* Unmuted indicator dot */}
          {!isMuted && isReady && (
            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60" />
          )}
        </>
      ) : (
        <div
          className="w-full h-full"
          style={{ background: 'rgba(0,0,0,0.3)', minHeight: '200px' }}
        />
      )}
    </div>
  )
}
