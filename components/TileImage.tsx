'use client'

/**
 * TILE IMAGE — native <img>, no Next.js Image
 *
 * Matches edit page SortableTile rendering exactly:
 * - auto aspect: w-full h-auto (natural sizing)
 * - non-auto: absolute inset-0 w-full h-full (fills container)
 * - object-cover everywhere
 */

interface TileImageProps {
  src: string
  alt: string
  sizes: string
  index: number
  aspect?: string
}

export default function TileImage({ src, alt, sizes, index, aspect = 'auto' }: TileImageProps) {
  const isAuto = aspect === 'auto'

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={isAuto
        ? 'w-full h-auto object-cover'
        : 'absolute inset-0 w-full h-full object-cover'
      }
      loading={index < 4 ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
