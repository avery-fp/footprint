'use client'

import { useState } from 'react'
import Image from 'next/image'

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
}

export default function TileImage({ src, alt, sizes, index }: TileImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain"
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
      onError={() => setFailed(true)}
    />
  )
}
