'use client'

import { useState, useRef, useEffect, useCallback, type PointerEvent } from 'react'
import Image from 'next/image'
import { useAspectDetection } from '@/lib/aspectDetection'
import { audioManager } from '@/lib/audio-manager'
import { beginInvocation, isIntentionalInvocation, type InvocationPoint } from '@/lib/media-invocation'

const PUBLIC_EAGER_IMAGE_COUNT = 96
const PUBLIC_SYNC_DECODE_COUNT = 16
const PUBLIC_NEAR_VIEWPORT_MARGIN = '3200px 0px 3200px 0px'
const settledPublicMedia = new Set<string>()
const settledTileMedia = new Set<string>()

function logMediaMount(label: string, id: string) {
  if (process.env.NODE_ENV !== 'development') return
  console.debug(`[fp-media] mount ${label}`, id)
  return () => console.debug(`[fp-media] unmount ${label}`, id)
}

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
  aspect?: string
  layout?: string
  size?: number
  isPublicView?: boolean
}

/** Compute aspect from a natural ratio. */
function inferAspect(r: number): 'portrait' | 'landscape' | 'square' {
  return r > 1.2 ? 'landscape' : r < 0.8 ? 'portrait' : 'square'
}

export default function TileImage({ src, alt, sizes, index, aspect, layout, size, isPublicView = false }: TileImageProps) {
  const [failed, setFailed] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [loaded, setLoaded] = useState(() => settledTileMedia.has(src) || (isPublicView && settledPublicMedia.has(src)))
  const [shouldSettlePublicMedia, setShouldSettlePublicMedia] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const [videoPressActive, setVideoPressActive] = useState(false)
  const [fallbackVideoResting, setFallbackVideoResting] = useState(false)
  const [isNearPublicViewport, setIsNearPublicViewport] = useState(false)
  const onAspectDetected = useAspectDetection()
  const fallbackVideoRef = useRef<HTMLVideoElement>(null)
  const audioIdRef = useRef(`tile-image-video-${src}`)
  const invocationPointRef = useRef<InvocationPoint | null>(null)

  useEffect(() => logMediaMount('TileImage', src), [src])

  useEffect(() => {
    setFailed(false)
    setVideoFailed(false)
    setLoaded(settledTileMedia.has(src) || (isPublicView && settledPublicMedia.has(src)))
    setShouldSettlePublicMedia(false)
    setVideoMuted(true)
    setFallbackVideoResting(false)
    setIsNearPublicViewport(settledTileMedia.has(src) || (isPublicView && settledPublicMedia.has(src)))
  }, [isPublicView, src])

  // Ref for the grid-mode wrapper div. Used in the mount-time fallback to detect
  // images that were already complete (cached/priority) before onLoad could fire.
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const audioId = audioIdRef.current
    audioManager.register(audioId, () => {
      const video = fallbackVideoRef.current
      if (video) audioManager.silenceNativeMedia(video)
      setVideoMuted(true)
      setFallbackVideoResting(true)
    })
    return () => {
      audioManager.release(audioId)
      audioManager.unregister(audioId)
    }
  }, [])

  const toggleFallbackVideoAudio = useCallback(() => {
    const video = fallbackVideoRef.current
    if (!video) return
    if (video.muted) {
      audioManager.playNative(audioIdRef.current, video)
      setVideoMuted(false)
      setFallbackVideoResting(false)
      video.play().catch(() => {})
    } else {
      audioManager.release(audioIdRef.current)
      audioManager.silenceNativeMedia(video)
      setVideoMuted(true)
      setFallbackVideoResting(true)
    }
  }, [])

  const handleInvocationPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    e.stopPropagation()
    setVideoPressActive(true)
    if (e.pointerType === 'mouse') {
      toggleFallbackVideoAudio()
      return
    }
    invocationPointRef.current = beginInvocation(e.pointerId, e.clientX, e.clientY)
  }, [toggleFallbackVideoAudio])

  const handleInvocationPointerUp = useCallback((e: PointerEvent<HTMLElement>) => {
    e.stopPropagation()
    if (e.pointerType === 'mouse') {
      setVideoPressActive(false)
      return
    }
    const shouldInvoke = isIntentionalInvocation(invocationPointRef.current, e.pointerId, e.clientX, e.clientY)
    invocationPointRef.current = null
    setVideoPressActive(false)
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
    settledTileMedia.add(src)
    if (isPublicView) settledPublicMedia.add(src)
    if (!isPublicView && onAspectDetected && img.naturalHeight) {
      onAspectDetected(inferAspect(img.naturalWidth / img.naturalHeight))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — one-time mount check only

  useEffect(() => {
    if (!isPublicView) return
    const el = containerRef.current
    if (!el) return
    if (index < PUBLIC_EAGER_IMAGE_COUNT) {
      setIsNearPublicViewport(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setIsNearPublicViewport(true)
        observer.disconnect()
      },
      { rootMargin: PUBLIC_NEAR_VIEWPORT_MARGIN }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [index, isPublicView])

  if (failed && videoFailed) return null

  if (failed) {
    const rawSrc = src.replace('/render/image/public/', '/object/public/').replace(/\?width=\d+&quality=\d+$/, '')
    return (
      <div className="absolute inset-0">
        <video
          ref={fallbackVideoRef}
          src={rawSrc}
          className="w-full h-full object-cover"
          style={{
            opacity: fallbackVideoResting && videoMuted ? 0 : 1,
            transition: 'opacity 180ms ease-out',
          }}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onPlay={() => setFallbackVideoResting(false)}
          onPause={(e) => {
            if (e.currentTarget.muted) setFallbackVideoResting(true)
          }}
          onWaiting={() => {
            if (videoMuted) setFallbackVideoResting(true)
          }}
          onStalled={() => {
            if (videoMuted) setFallbackVideoResting(true)
          }}
          onLoadedMetadata={(e) => {
            if (!isPublicView && onAspectDetected) {
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
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'rgba(0,0,0,0.30)',
            opacity: fallbackVideoResting && videoMuted ? 1 : 0,
            transition: 'opacity 180ms ease-out',
            zIndex: 2,
          }}
        />
        <button
          type="button"
          aria-label={videoMuted ? 'Play audio' : 'Mute audio'}
          onPointerDown={handleInvocationPointerDown}
          onPointerUp={handleInvocationPointerUp}
          onPointerCancel={() => { invocationPointRef.current = null; setVideoPressActive(false) }}
          onPointerLeave={() => setVideoPressActive(false)}
          className="absolute inset-0 [@media(pointer:coarse)]:inset-auto [@media(pointer:coarse)]:left-1/2 [@media(pointer:coarse)]:top-1/2 [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:h-24 [@media(pointer:coarse)]:w-24 [@media(pointer:coarse)]:-translate-x-1/2 [@media(pointer:coarse)]:-translate-y-1/2 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:justify-center [@media(pointer:coarse)]:rounded-full"
          style={{
            zIndex: 3,
            border: 'none',
            background: videoPressActive ? 'rgba(255,255,255,0.025)' : 'transparent',
            opacity: videoPressActive ? 0.18 : 0,
            transition: 'opacity 140ms ease',
          }}
        />
      </div>
    )
  }

  // Public rooms are static artifacts: the poster img exists immediately and
  // browser-native scheduling owns loading. Player/video depth still sleeps
  // elsewhere; this is only the visual surface.
  if (isPublicView) {
    const isPriority = index < PUBLIC_EAGER_IMAGE_COUNT
    const isSyncDecode = index < PUBLIC_SYNC_DECODE_COUNT
    const publicPosterClass = `absolute inset-0 h-full w-full object-cover fp-public-poster${shouldSettlePublicMedia ? ' fp-media-settle' : ''}`
    return (
      <div ref={containerRef} className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          sizes={sizes}
          className={publicPosterClass}
          loading="eager"
          fetchPriority={isPriority ? 'high' : 'auto'}
          decoding={isSyncDecode ? 'sync' : 'async'}
          onLoad={() => {
            setLoaded(true)
            settledTileMedia.add(src)
            if (!settledPublicMedia.has(src)) {
              settledPublicMedia.add(src)
              setShouldSettlePublicMedia(true)
            }
          }}
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  // editor/private surfaces keep Next.js Image fill + object-cover.
  return (
    <div ref={containerRef} className="absolute inset-0">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={isPublicView
          ? 'object-cover fp-public-poster'
          : `object-cover transition-opacity duration-700 ease-out ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        quality={90}
        onLoad={(e) => {
          setLoaded(true)
          settledTileMedia.add(src)
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
