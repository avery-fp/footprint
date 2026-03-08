'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * TILE IMAGE
 *
 * Bulletproof image tile with error recovery.
 * Matches edit page SortableTile rendering exactly:
 * - Always uses width={400} height={400} (never `fill`)
 * - aspect='auto': w-full h-auto object-contain
 * - aspect!='auto': absolute inset-0 w-full h-full object-contain
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
  aspect = 'auto',
  onWidescreen,
}: TileImageProps) {
  const [failed, setFailed] = useState(false)

  const isAuto = aspect === 'auto'
  const className = isAuto
    ? 'w-full h-auto object-contain'
    : 'absolute inset-0 w-full h-full object-contain'

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        loading={index < 4 ? 'eager' : 'lazy'}
        decoding="async"
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={400}
      sizes={sizes}
      className={className}
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
