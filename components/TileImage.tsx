'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * TILE IMAGE
 *
 * Bulletproof image tile with error recovery.
 * Starts with Next.js <Image>, falls back to raw <img> on error.
 */

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
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
        className="w-full h-auto block"
        loading={index < 4 ? 'eager' : 'lazy'}
        decoding="async"
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={800}
      height={800}
      sizes={sizes}
      className="w-full h-auto block"
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
