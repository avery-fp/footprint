'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * TILE IMAGE
 *
 * Bulletproof image tile with error recovery.
 * aspect='auto': natural sizing (w-full h-auto) — matches edit page
 * aspect!='auto': fill mode (absolute inset-0) — crops to fit container
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

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={isAuto ? 'w-full h-auto object-contain' : 'absolute inset-0 w-full h-full object-contain'}
        loading={index < 4 ? 'eager' : 'lazy'}
        decoding="async"
      />
    )
  }

  if (isAuto) {
    return (
      <Image
        src={src}
        alt={alt}
        width={400}
        height={400}
        sizes={sizes}
        className="w-full h-auto object-contain"
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

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-contain inset-0"
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
