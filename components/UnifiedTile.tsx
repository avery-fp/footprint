'use client'

import { memo } from 'react'
import ContentCardBase from '@/components/ContentCard'
import VideoTileBase from '@/components/VideoTile'
import GhostTileBase from '@/components/GhostTile'
import TileImage from '@/components/TileImage'
import ZoomableImage from '@/components/ZoomableImage'
import ContainerTileBase from '@/components/ContainerTile'
import { getImageSizes } from '@/lib/media/aspect'

const ContainerTile = memo(ContainerTileBase)

const ContentCard = memo(ContentCardBase)
const VideoTile = memo(VideoTileBase)
const GhostTile = memo(GhostTileBase)

/**
 * UNIFIED TILE — layout-aware rendering
 *
 * grid: square crop, fill + object-cover
 * editorial: edit-page-style, width/height Image with aspect-aware positioning
 *
 * MIME-type contract:
 *   video/* → type='video'   |   image/* → type='image'
 *   Unknown/failed → Recovery Tile (gray glass, never invisible)
 */

// Canonical type resolution — URL extension overrides stored type
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|3gp|3gpp|mkv)($|\?)/i
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|heic|avif|svg)($|\?)/i

function resolveCanonicalType(type: string, url: string): 'video' | 'image' | 'thought' | 'content' {
  if (type === 'thought') return 'thought'
  if (VIDEO_EXT.test(url)) return 'video'
  if (type === 'video') return 'video'
  if (IMAGE_EXT.test(url)) return 'image'
  if (type === 'image') return 'image'
  return 'content'
}

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
    render_mode?: string
    artist?: string | null
    thumbnail_url_hq?: string | null
    media_id?: string | null
    container_label?: string | null
    container_cover_url?: string | null
  }
  index: number
  size: number
  aspect: string
  mode: TileMode
  layout?: string
  isMobile?: boolean
  isExpanded?: boolean
  isSoundRoom?: boolean
  childCount?: number
  firstChildThumb?: string | null
}

// ── Recovery Tile — renders when type is unknown or media fails ──
function RecoveryTile({ id }: { id: string }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(8px)',
      }}
      data-tile-id={id}
      data-tile-type="recovery"
    >
      <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    </div>
  )
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
  isSoundRoom = false,
  childCount,
  firstChildThumb,
}: UnifiedTileProps) {
  // ── Container tile — a door, not a window ──
  if (item.type === 'container') {
    return (
      <div className="w-full h-full" data-tile-id={item.id} data-tile-type="container">
        <ContainerTile
          label={item.container_label || item.title || 'Collection'}
          coverUrl={item.container_cover_url}
          childCount={childCount}
          firstChildThumb={firstChildThumb}
        />
      </div>
    )
  }

  const canonicalType = resolveCanonicalType(item.type, item.url || '')
  const isAuto = aspect === 'auto'

  // ── Thought ──
  if (canonicalType === 'thought') {
    const text = item.title || ''
    const len = text.length
    const fontSize = len <= 6 ? '24px' : len <= 20 ? '17px' : len <= 60 ? '14px' : '13px'
    const letterSpacing = len <= 6 ? '-0.03em' : len <= 20 ? '-0.02em' : '-0.01em'
    return (
      <div
        className="w-full h-full flex items-center justify-center p-4"
        style={{ background: 'rgba(255,255,255,0.04)' }}
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

  // ── Video ──
  if (canonicalType === 'video') {
    if (mode === 'public') {
      return (
        <div className="w-full h-full" data-tile-id={item.id} data-tile-type="video">
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
  if (canonicalType === 'image') {
    if (mode === 'public') {
      return (
        <div
          className={isAuto && layout === 'editorial' ? 'w-full' : 'w-full h-full'}
          data-tile-id={item.id}
          data-tile-type="image"
        >
          <ZoomableImage>
            <TileImage
              src={item.url}
              alt={item.title || ''}
              sizes="(max-width: 768px) 50vw, 440px"
              index={index}
              aspect={aspect}
              layout={layout}
            />
          </ZoomableImage>
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

  // ── Ghost tile — de-branded media render ──
  // In the sound room, force ghost rendering for audio platforms even without render_mode
  const AUDIO_PLATFORMS = ['spotify', 'soundcloud', 'youtube', 'vimeo']
  const forceGhost = isSoundRoom && AUDIO_PLATFORMS.includes(item.type)
  const ghostMediaId = item.media_id || item.id // fallback to tile id for legacy tiles
  if ((item.render_mode === 'ghost' || forceGhost) && ghostMediaId) {
    return (
      <div className="w-full h-full" data-tile-id={item.id} data-tile-type={`ghost-${item.type}`}>
        <GhostTile
          url={item.url}
          platform={item.type}
          media_id={ghostMediaId}
          title={item.title || undefined}
          artist={item.artist || undefined}
          thumbnail_url={item.thumbnail_url_hq || item.thumbnail_url || undefined}
        />
      </div>
    )
  }

  // ── Payment link tile (Stripe hosted) — commerce becomes real ──
  const isPaymentLink = item.url && (
    item.url.includes('buy.stripe.com') ||
    item.url.includes('checkout.stripe.com') ||
    item.type === 'payment'
  )
  if (isPaymentLink) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 group cursor-pointer no-underline"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 'inherit',
          textDecoration: 'none',
        }}
        data-tile-id={item.id}
        data-tile-type="payment"
      >
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt={item.title || ''}
            className="w-16 h-16 rounded-xl object-cover"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </div>
        )}
        <span
          className="text-white/70 font-mono tracking-[0.1em] uppercase text-center leading-tight group-hover:text-white/90 transition-colors"
          style={{ fontSize: '11px', fontWeight: 400 }}
        >
          {item.title || 'pay'}
        </span>
        {item.description && (
          <span
            className="text-white/30 text-center line-clamp-2"
            style={{ fontSize: '11px' }}
          >
            {item.description}
          </span>
        )}
      </a>
    )
  }

  // ── Content card (YouTube, Spotify, links, etc.) ──
  if (item.url || item.thumbnail_url || item.embed_html) {
    return (
      <div className="w-full h-full" data-tile-id={item.id} data-tile-type={item.type}>
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

  // ── Recovery Tile — unknown type, no URL, or broken data ──
  return <RecoveryTile id={item.id} />
}
