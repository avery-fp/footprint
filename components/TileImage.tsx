'use client'

import { useState } from 'react'
import Image from 'next/image'

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
  aspect?: string
  layout?: string
}

export default function TileImage({ src, alt, sizes, index, layout }: TileImageProps) {
  const [failed, setFailed] = useState(false)

  // flow / void → native img with natural proportions
  const useNative = layout === 'flow' || layout === 'void'

  if (failed || useNative) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={useNative ? 'w-full h-auto' : 'w-full h-full object-cover'}
        loading={index < 4 ? 'eager' : 'lazy'}
        decoding="async"
      />
    )
  }

  // brutalist (default) → Next.js Image fill + object-cover (square crop)
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
      loading={index < 4 ? 'eager' : 'lazy'}
      priority={index < 2}
      quality={75}
      onError={() => setFailed(true)}
    />
  )
}
