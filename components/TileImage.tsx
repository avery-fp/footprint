'use client'

import { useState } from 'react'
import Image from 'next/image'
import { getObjectFit } from '@/lib/media/aspect'

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
  aspect?: string
  layout?: string
}

export default function TileImage({ src, alt, sizes, index, aspect, layout }: TileImageProps) {
  const [failed, setFailed] = useState(false)

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
      />
    )
  }

  // editorial mode → match edit page: width/height Image with absolute positioning
  if (isEditorial) {
    return (
      <Image
        src={src}
        alt={alt}
        width={800}
        height={800}
        sizes={sizes}
        className={`${isAuto ? 'w-full h-auto' : 'absolute inset-0 w-full h-full'} ${getObjectFit(aspect || 'square')}`}
        loading={index < 4 ? 'eager' : 'lazy'}
        quality={90}
        onError={() => setFailed(true)}
      />
    )
  }

  // grid (default) → Next.js Image fill + object-cover (square crop)
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
      loading={index < 4 ? 'eager' : 'lazy'}
      priority={index < 2}
      quality={90}
      onError={() => setFailed(true)}
    />
  )
}
