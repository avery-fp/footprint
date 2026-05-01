'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { getObjectFit } from '@/lib/media/aspect'
import { useAspectDetection } from '@/lib/aspectDetection'

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

// Session-scoped Content-Type cache. Each library URL gets HEAD-probed once
// per session; subsequent renders reuse the result. Prevents the heal pass
// from firing the same network round-trip on every scroll/route change.
const VIDEO_CT_CACHE = new Map<string, boolean>()
const PROBE_INFLIGHT = new Map<string, Promise<boolean>>()

function shouldProbe(src: string): boolean {
  // Only probe our own storage URLs (Supabase public bucket). External URLs
  // (YouTube thumbnails, etc.) are not affected by the .jpg-video bug.
  if (!src) return false
  if (src.startsWith('data:')) return false
  if (!src.includes('/storage/v1/object/public/')) return false
  // Only probe URLs whose extension lies about being an image — those are
  // the candidates for "video bytes at .jpg URL". Real video extensions
  // already route through the <video> path upstream.
  return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(src)
}

async function probeIsVideo(src: string): Promise<boolean> {
  if (VIDEO_CT_CACHE.has(src)) return VIDEO_CT_CACHE.get(src)!
  const inflight = PROBE_INFLIGHT.get(src)
  if (inflight) return inflight
  const promise = (async () => {
    try {
      const res = await fetch(src, { method: 'HEAD' })
      const ct = res.headers.get('content-type') || ''
      const isVideo = ct.toLowerCase().startsWith('video/')
      VIDEO_CT_CACHE.set(src, isVideo)
      return isVideo
    } catch {
      VIDEO_CT_CACHE.set(src, false)
      return false
    } finally {
      PROBE_INFLIGHT.delete(src)
    }
  })()
  PROBE_INFLIGHT.set(src, promise)
  return promise
}

export default function TileImage({ src, alt, sizes, index, aspect, layout, size }: TileImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Render-time probe: legacy uploads stored video bytes at .jpg URLs.
  // Next.js Image successfully serves a still frame (Sharp extracts JPEG
  // from the video container) so the failed-state fallback never fires.
  // We HEAD-probe the source URL once per session and switch to <video>
  // when the response Content-Type is video/*.
  const [isActuallyVideo, setIsActuallyVideo] = useState<boolean>(() =>
    VIDEO_CT_CACHE.get(src) === true
  )
  const onAspectDetected = useAspectDetection()

  useEffect(() => {
    if (!shouldProbe(src)) return
    if (VIDEO_CT_CACHE.has(src)) {
      setIsActuallyVideo(VIDEO_CT_CACHE.get(src)!)
      return
    }
    let cancelled = false
    probeIsVideo(src).then(isVideo => {
      if (!cancelled && isVideo) setIsActuallyVideo(true)
    })
    return () => { cancelled = true }
  }, [src])

  // Render as <video> when the source is actually video bytes. Wrapper,
  // classes, and layout match the existing image render so the tile shape
  // and grid behavior stay identical — only the inner element changes.
  if (isActuallyVideo) {
    return (
      <video
        src={src}
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
      />
    )
  }

  // Ref for the grid-mode wrapper div. Used in the mount-time fallback to detect
  // images that were already complete (cached/priority) before onLoad could fire.
  const containerRef = useRef<HTMLDivElement>(null)

  // Fallback detection for cached/priority images.
  // React's synthetic onLoad won't fire for img elements that finished loading before
  // the event listener was attached. We check once after mount and fire immediately.
  useEffect(() => {
    if (!onAspectDetected || !containerRef.current) return
    const img = containerRef.current.querySelector('img')
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return
    onAspectDetected(inferAspect(img.naturalWidth / img.naturalHeight))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — one-time mount check only

  const isEditorial = layout === 'editorial'
  const isAuto = aspect === 'auto'

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        loading={index < 4 ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={(e) => {
          if (onAspectDetected) {
            const img = e.currentTarget
            onAspectDetected(inferAspect(img.naturalWidth / img.naturalHeight))
          }
        }}
      />
    )
  }

  // Shimmer placeholder visible until image loads
  const shimmer = !loaded ? <div className="absolute inset-0 fp-skeleton" /> : null

  // editorial mode → match edit page: width/height Image with absolute positioning
  if (isEditorial) {
    return (
      <>
        {shimmer}
        <Image
          src={src}
          alt={alt}
          width={800}
          height={800}
          sizes={sizes}
          className={`${isAuto ? 'w-full h-auto' : 'absolute inset-0 w-full h-full'} ${getObjectFit(aspect || 'square', size)} transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading={index < 4 ? 'eager' : 'lazy'}
          quality={90}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </>
    )
  }

  // grid (default) → Next.js Image fill + object-cover.
  // containerRef wraps the output so useEffect can find the underlying img element
  // for the cached-image fallback. SAspectShell (if in tree) reshapes the S tile
  // container to match detected orientation, then cover fills naturally.
  return (
    <div ref={containerRef} className="absolute inset-0">
      {shimmer}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading={index < 4 ? 'eager' : 'lazy'}
        priority={index < 2}
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
