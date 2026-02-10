'use client'

import { useState, useRef, useEffect } from 'react'
import { audioManager } from '@/lib/audio-manager'

export default function VideoTile({ src, onWidescreen }: { src: string; onWidescreen?: () => void }) {
  const [isMuted, setIsMuted] = useState(true)
  const [isInView, setIsInView] = useState(false)
  const [isWide, setIsWide] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoId = useRef(`video-${src}-${Math.random()}`).current

  // IntersectionObserver — only load video when near viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true) },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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

  return (
    <div ref={containerRef} className="relative group">
      {isInView ? (
        <>
          <video
            ref={videoRef}
            src={src}
            className={`w-full ${isWide ? 'aspect-video' : 'aspect-square'} object-cover rounded-xl cursor-pointer`}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            onClick={handleClick}
            onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = 'none' }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              if (v.videoWidth > v.videoHeight * 1.3) {
                setIsWide(true)
                onWidescreen?.()
              }
            }}
          />
          {!isMuted && (
            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60" />
          )}
        </>
      ) : (
        <div className="w-full aspect-square rounded-xl bg-white/[0.03]" />
      )}
    </div>
  )
}
