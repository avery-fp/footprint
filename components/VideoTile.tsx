'use client'

import { useState, useRef, useEffect } from 'react'
import { audioManager } from '@/lib/audio-manager'

export default function VideoTile({ src, onWidescreen }: { src: string; onWidescreen?: () => void }) {
  const [isMuted, setIsMuted] = useState(true)
  const [isInView, setIsInView] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isWide, setIsWide] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoId = useRef(`video-${src}-${Math.random()}`).current

  // IntersectionObserver — render when near, play/pause on visibility
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          setIsVisible(true)
        } else {
          setIsVisible(false)
        }
      },
      { rootMargin: '100vh' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Play/pause based on viewport visibility
  // Without autoPlay, we call .play() to initiate download + playback when visible
  useEffect(() => {
    if (!videoRef.current) return
    if (isVisible) {
      videoRef.current.play().catch(() => {})
    } else if (isReady) {
      videoRef.current.pause()
    }
  }, [isVisible, isReady])

  // Timeout — if video doesn't load in 15s, hide it
  useEffect(() => {
    if (!isInView) return
    const timer = setTimeout(() => {
      if (!isReady) setHasFailed(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [isInView, isReady])

  // Register with audio manager
  useEffect(() => {
    if (!isInView) return
    audioManager.register(videoId, () => {
      if (videoRef.current) {
        videoRef.current.muted = true
        setIsMuted(true)
      }
    })
    return () => audioManager.unregister(videoId)
  }, [videoId, isInView])

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
    <div ref={containerRef} className="relative group">
      {isInView ? (
        <>
          <video
            ref={videoRef}
            src={src}
            className={`w-full ${isWide ? 'aspect-video' : 'aspect-square'} object-cover rounded-xl cursor-pointer transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
            muted
            loop
            playsInline
            preload="none"
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
