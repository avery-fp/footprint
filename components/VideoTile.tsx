'use client'

import { useState, useRef, useEffect } from 'react'
import { audioManager } from '@/lib/audio-manager'

export default function VideoTile({ src, onWidescreen }: { src: string; onWidescreen?: () => void }) {
  const [isMuted, setIsMuted] = useState(true)
  const [isNear, setIsNear] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const [showTapFeedback, setShowTapFeedback] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoId = useRef(`video-${src}-${Math.random()}`).current

  // Two observers: one for "near" (load metadata), one for "visible" (play)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Near viewport — mount the video element
    const nearObs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsNear(true) },
      { rootMargin: '200px' }
    )
    // Actually visible — play/pause
    const visObs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '0px' }
    )
    nearObs.observe(el)
    visObs.observe(el)
    return () => { nearObs.disconnect(); visObs.disconnect() }
  }, [])

  // Play only when visible, pause when off-screen
  useEffect(() => {
    if (!videoRef.current) return
    if (isVisible) {
      videoRef.current.play().catch(() => {})
    } else {
      videoRef.current.pause()
    }
  }, [isVisible, isReady])

  // Timeout — if video doesn't load in 15s, hide it
  useEffect(() => {
    if (!isNear) return
    const timer = setTimeout(() => {
      if (!isReady) setHasFailed(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [isNear, isReady])

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
      // Show brief tap feedback
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

  if (hasFailed) {
    // Dark placeholder instead of empty gap
    return (
      <div
        ref={containerRef}
        className="relative w-full h-full"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', minHeight: '200px' }}
      />
    )
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {isNear ? (
        <>
          <video
            ref={videoRef}
            src={src}
            className="w-full h-full object-contain cursor-pointer"
            muted
            loop
            playsInline
            preload="metadata"
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
          {/* Skeleton while loading */}
          {!isReady && (
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(4px)' }}
            />
          )}
          {/* Brief play/pause tap feedback — flashes then disappears */}
          {showTapFeedback && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ animation: 'materialize 400ms ease-out forwards' }}>
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
          {/* Unmuted indicator dot — subtle */}
          {!isMuted && isReady && (
            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60" />
          )}
        </>
      ) : (
        // Skeleton placeholder while not near viewport
        <div
          className="w-full h-full"
          style={{ background: 'rgba(255,255,255,0.04)', minHeight: '200px' }}
        />
      )}
    </div>
  )
}
