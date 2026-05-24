'use client'

import { useState, useRef, useEffect, useCallback, type PointerEvent } from 'react'
import Image from 'next/image'
import { getObjectFit } from '@/lib/media/aspect'
import { useAspectDetection } from '@/lib/aspectDetection'
import { audioManager } from '@/lib/audio-manager'
import { beginInvocation, isIntentionalInvocation, type InvocationPoint } from '@/lib/media-invocation'

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
  aspect?: string
  layout?: string
  size?: number
}

/** Compute aspect from a natural ratio. */
function inferAspect(r: number): 'portrait' | 'landscape' | 'square' {
  return r > 1.2 ? 'landscape' : r < 0.8 ? 'portrait' : 'square'
}

export default function TileImage({ src, alt, sizes, index, aspect, layout, size }: TileImageProps) {
  const [failed, setFailed] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const onAspectDetected = useAspectDetection()
  const fallbackVideoRef = useRef<HTMLVideoElement>(null)
  const audioIdRef = useRef(`tile-image-video-${src}`)
  const invocationPointRef = useRef<InvocationPoint | null>(null)

  useEffect(() => {
    setFailed(false)
    setVideoFailed(false)
    setLoaded(false)
    setVideoMuted(true)
  }, [src])

  // Ref for the grid-mode wrapper div. Used in the mount-time fallback to detect
  // images that were already complete (cached/priority) before onLoad could fire.
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const audioId = audioIdRef.current
    audioManager.register(audioId, () => {
      const video = fallbackVideoRef.current
      if (video) video.muted = true
      setVideoMuted(true)
    })
    return () => audioManager.unregister(audioId)
  }, [])

  const toggleFallbackVideoAudio = useCallback(() => {
    const video = fallbackVideoRef.current
    if (!video) return
    if (video.muted) {
      audioManager.play(audioIdRef.current)
      video.muted = false
      setVideoMuted(false)
      video.play().catch(() => {})
    } else {
      audioManager.mute(audioIdRef.current)
      video.muted = true
      setVideoMuted(true)
    }
  }, [])

  const handleInvocationPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    e.stopPropagation()
    if (e.pointerType === 'mouse') {
      toggleFallbackVideoAudio()
      return
    }
    invocationPointRef.current = beginInvocation(e.pointerId, e.clientX, e.clientY)
  }, [toggleFallbackVideoAudio])

  const handleInvocationPointerUp = useCallback((e: PointerEvent<HTMLElement>) => {
    e.stopPropagation()
    if (e.pointerType === 'mouse') return
    const shouldInvoke = isIntentionalInvocation(invocationPointRef.current, e.pointerId, e.clientX, e.clientY)
    invocationPointRef.current = null
    if (shouldInvoke) toggleFallbackVideoAudio()
  }, [toggleFallbackVideoAudio])

  // Fallback detection for cached/priority images.
  // React's synthetic onLoad won't fire for img elements that finished loading before
  // the event listener was attached. We check once after mount and fire immediately.
  useEffect(() => {
    if (!containerRef.current) return
    const img = containerRef.current.querySelector('img')
    if (!img || !img.complete || !img.naturalWidth) return
    setLoaded(true)
    if (onAspectDetected && img.naturalHeight) {
      onAspectDetected(inferAspect(img.naturalWidth / img.naturalHeight))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — one-time mount check only

  if (failed && videoFailed) return null

  if (failed) {
    const rawSrc = src.replace('/render/image/public/', '/object/public/').replace(/\?width=\d+&quality=\d+$/, '')
    return (
      <div className="absolute inset-0">
        <video
          ref={fallbackVideoRef}
          src={rawSrc}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onLoadedMetadata={(e) => {
            if (onAspectDetected) {
              const v = e.currentTarget
              if (v.videoWidth && v.videoHeight) {
                onAspectDetected(inferAspect(v.videoWidth / v.videoHeight))
              }
            }
          }}
          onError={() => {
            setVideoFailed(true)
          }}
        />
        <button
          type="button"
          aria-label={videoMuted ? 'Play audio' : 'Mute audio'}
          onPointerDown={handleInvocationPointerDown}
          onPointerUp={handleInvocationPointerUp}
          onPointerCancel={() => { invocationPointRef.current = null }}
          className="absolute inset-0 [@media(pointer:coarse)]:inset-auto [@media(pointer:coarse)]:left-1/2 [@media(pointer:coarse)]:top-1/2 [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:h-24 [@media(pointer:coarse)]:w-24 [@media(pointer:coarse)]:-translate-x-1/2 [@media(pointer:coarse)]:-translate-y-1/2 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:justify-center [@media(pointer:coarse)]:rounded-full"
          style={{
            zIndex: 3,
            border: 'none',
            background: 'transparent',
            opacity: 0,
            transition: 'opacity 180ms ease',
          }}
        />
        <div data-mute-dot className="absolute bottom-2.5 right-2.5 pointer-events-none transition-opacity duration-300" style={{ opacity: videoMuted ? 0.35 : 0.9 }}>
          <div className="w-2 h-2 rounded-full" style={{ background: '#fff' }} />
        </div>
      </div>
    )
  }

  // Shimmer placeholder visible until image loads
  const shimmer = !loaded ? <div className="absolute inset-0 fp-skeleton" /> : null

  // grid/horizontal → Next.js Image fill + object-cover.
  return (
    <div ref={containerRef} className="absolute inset-0">
      {shimmer}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        quality={90}
        onLoad={(e) => {
          setLoaded(true)
          if (onAspectDetected) {
            const img = e.currentTarget as HTMLImageElement
            onAspectDetected(inferAspect(img.naturalWidth / img.naturalHeight))
          }
        }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
