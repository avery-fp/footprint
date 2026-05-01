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

export default function TileImage({ src, alt, sizes, index, aspect, layout, size }: TileImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const onAspectDetected = useAspectDetection()

  // Ref for the grid-mode wrapper div. Used in the mount-time fallback to detect
  // images that were already complete (cached/priority) before onLoad could fire.
  const containerRef = useRef<HTMLDivElement>(null)

  // Fallback detection for cached/priority images.
  // React's synthetic onLoad won't fire for img elements that finished loading before
  // the event listener was attached. We check once after mount and fire immediately.
  useEffect(() => {
    if (!containerRef.current) return
    const img = containerRef.current.querySelector('img')
    if (!img || !img.complete || !img.naturalWidth) return
    // Image already loaded from cache before onLoad could attach — show it now.
    setLoaded(true)
    if (onAspectDetected && img.naturalHeight) {
      onAspectDetected(inferAspect(img.naturalWidth / img.naturalHeight))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — one-time mount check only

  const isEditorial = layout === 'editorial'
  const isAuto = aspect === 'auto'

  if (failed) {
    // Undo transformImageUrl: the render/image endpoint can't serve video bytes.
    const rawSrc = src.replace('/render/image/public/', '/object/public/').replace(/\?width=\d+&quality=\d+$/, '')
    return (
      <video
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
