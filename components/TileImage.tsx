'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * TILE IMAGE
 *
 * Uses Next.js Image `fill` for native absolute positioning.
 * Parent MUST have position:relative and explicit dimensions.
 * object-contain = full image visible, no cropping.
 */

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
  aspect?: string
  onWidescreen?: () => void
}

export default function TileImage({
  src,
  alt,
  sizes,
  index,
  onWidescreen,
}: TileImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain"
        loading={index < 4 ? 'eager' : 'lazy'}
        decoding="async"
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-contain"
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
  )
}
