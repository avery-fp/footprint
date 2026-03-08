'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * TILE IMAGE
 *
 * Bulletproof image tile with error recovery.
 * Shows FULL image (object-contain) with blurred background fill.
 * No zoom, no crop, no voids — iOS Photos style.
 */

interface TileImageProps {
  src: string
  alt: string
  width: number
  height: number
  sizes: string
  index: number
  onWidescreen?: () => void
}

export default function TileImage({
  src,
  alt,
  width,
  height,
  sizes,
  index,
  onWidescreen,
}: TileImageProps) {
  const [failed, setFailed] = useState(false)

  const blurFillStyle = {
    backgroundImage: `url(${src})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'blur(32px) saturate(1.8)',
    transform: 'scale(1.3)',
  }

  if (failed) {
    return (
      <div className="relative w-full h-full overflow-hidden">
        <div className="absolute inset-0" style={blurFillStyle} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="relative w-full h-full object-contain z-10"
          loading={index < 4 ? 'eager' : 'lazy'}
          decoding="async"
        />
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0" style={blurFillStyle} aria-hidden="true" />
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className="relative w-full h-full object-contain z-10"
        loading={index < 4 ? 'eager' : 'lazy'}
        priority={index < 2}
        quality={75}
        fetchPriority={index === 0 ? 'high' : undefined}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement
          if (img.naturalWidth > img.naturalHeight * 1.3) onWidescreen?.()
        }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
