'use client'

import { memo } from 'react'
import ContentCardBase from '@/components/ContentCard'
import VideoTileBase from '@/components/VideoTile'
import TileImage from '@/components/TileImage'
import { getImageSizes } from '@/lib/media/aspect'

const ContentCard = memo(ContentCardBase)
const VideoTile = memo(VideoTileBase)

/**
 * UNIFIED TILE — layout-aware rendering
 *
 * brutalist: square crop, fill + object-cover
 * flow/void: natural proportions, native img
 */

export type TileMode = 'public' | 'editor' | 'sandbox'

interface UnifiedTileProps {
  item: {
    id: string
    url: string
    type: string
    title: string | null
    description: string | null
    thumbnail_url: string | null
    embed_html: string | null
  }
  index: number
  size: number
  aspect: string
  mode: TileMode
  layout?: string
  isMobile?: boolean
  isExpanded?: boolean
}

export default function UnifiedTile({
  item,
  index,
  size,
  aspect,
  mode,
  layout,
  isMobile = false,
  isExpanded = false,
}: UnifiedTileProps) {
  const isFill = !layout || layout === 'brutalist'

  // ── Thought ──
  if (item.type === 'thought') {
    const text = item.title || ''
    const len = text.length
    const fontSize = len <= 6 ? '24px' : len <= 20 ? '17px' : len <= 60 ? '14px' : '13px'
    const letterSpacing = len <= 6 ? '-0.03em' : len <= 20 ? '-0.02em' : '-0.01em'
    return (
      <div
        className={isFill ? 'w-full h-full flex items-center justify-center p-4' : 'w-full flex items-center justify-center p-6'}
        style={{ background: 'rgba(255,255,255,0.04)', minHeight: isFill ? undefined : '120px' }}
        data-tile-id={item.id}
        data-tile-type="thought"
      >
        <p
          className="whitespace-pre-wrap text-center text-white"
          style={{ fontSize, fontWeight: 300, letterSpacing, lineHeight: 1.5 }}
        >
          {text}
        </p>
      </div>
    )
  }

  // ── Video (native or mistyped image) ──
  if (item.type === 'video' || (item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i))) {
    if (mode === 'public') {
      return (
        <div className={isFill ? 'w-full h-full' : 'w-full'} data-tile-id={item.id} data-tile-type="video">
          <VideoTile src={item.url} onWidescreen={() => {}} />
        </div>
      )
    }
    return (
      <div className="w-full h-full" data-tile-id={item.id} data-tile-type="video">
        <video
          src={item.url}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>
    )
  }

  // ── Image ──
  if (item.type === 'image') {
    if (mode === 'public') {
      return (
        <div className={isFill ? 'w-full h-full' : 'w-full'} data-tile-id={item.id} data-tile-type="image">
          <TileImage
            src={item.url}
            alt={item.title || ''}
            sizes="(max-width: 768px) 50vw, 25vw"
            index={index}
            aspect={aspect}
            layout={layout}
          />
        </div>
      )
    }
    return (
      <div className="relative w-full h-full overflow-hidden" data-tile-id={item.id} data-tile-type="image">
        <TileImage
          src={item.url}
          alt={item.title || ''}
          sizes={getImageSizes(size)}
          index={index}
        />
      </div>
    )
  }

  // ── Everything else — ContentCard ──
  return (
    <div className={isFill ? 'w-full h-full' : 'w-full'} data-tile-id={item.id} data-tile-type={item.type}>
      <ContentCard
        content={item}
        isMobile={isMobile}
        tileSize={size}
        aspect={aspect}
        isPublicView={mode === 'public'}
        isExpanded={isExpanded}
      />
    </div>
  )
}
