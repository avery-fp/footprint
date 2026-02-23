'use client'

import { useState, useRef, useEffect } from 'react'
import { audioManager } from '@/lib/audio-manager'

export default function VideoTile({ src, onWidescreen, aspect = 'square' }: { src: string; onWidescreen?: () => void; aspect?: string }) {
  const fitClass = aspect === 'auto' ? 'object-contain' : 'object-cover'
  const [isMuted, setIsMuted] = useState(true)
  const [isNear, setIsNear] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isWide, setIsWide] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
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

  if (hasFailed) return null

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {isNear ? (
        <>
          <video
            ref={videoRef}
            src={src}
            className={`w-full h-full ${fitClass} cursor-pointer transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
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
                setIsWide(true)
                onWidescreen?.()
              }
            }}
          />
          {!isMuted && isReady && (
            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60" />
          )}
        </>
      ) : null}
    </div>
  )
}
