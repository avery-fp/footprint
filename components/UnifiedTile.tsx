'use client'

import { memo, useState } from 'react'
import ContentCardBase from '@/components/ContentCard'
import GhostTileBase from '@/components/GhostTile'
import TileImage from '@/components/TileImage'
import ZoomableImage from '@/components/ZoomableImage'
import ContainerTileBase from '@/components/ContainerTile'
import PreviewCardTileBase from '@/components/PreviewCardTile'
import { getImageSizes } from '@/lib/media/aspect'
import { getThumbnailCandidates } from '@/lib/media/thumbnails'
import { extractYouTubeId } from '@/lib/parseEmbed'
import { resolveCanonicalType } from '@/lib/tile-rendering'
import TextExpandTile from '@/components/TextExpandTile'
import { isNewStyleRenderMode } from '@/lib/media/types'
import type { RenderMode } from '@/lib/media/types'
import DepthTile from '@/components/DepthTile'
import { matchDepthProvider } from '@/lib/depth-providers'

const ContainerTile = memo(ContainerTileBase)

const ContentCard = memo(ContentCardBase)
const GhostTile = memo(GhostTileBase)

/**
 * UNIFIED TILE — layout-aware rendering
 *
 * grid: fill + object-cover; S tile container is aspect-shaped before reaching here
 * editorial: edit-page-style, width/height Image with aspect-aware positioning
 *
 * Render contract:
 *   Every canonicalType has an explicit branch. No silent fallthrough.
 *   Unknown/unrenderable tiles return null — no empty glass shells.
 *   Dev mode logs dropped tiles for visibility.
 */

const VIDEO_PREVIEW_URL = /(?:youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com)/i

function shouldCropPreviewThumbnail(type: string, url: string, mediaKind?: string | null): boolean {
  return type === 'video' || mediaKind === 'video' || Boolean(extractYouTubeId(url)) || VIDEO_PREVIEW_URL.test(url)
}

function getPreviewThumbnailCandidates(item: Pick<UnifiedTileProps['item'], 'type' | 'url' | 'media_id' | 'thumbnail_url_hq' | 'thumbnail_url'>): string[] {
  return getThumbnailCandidates({
    type: item.type,
    url: item.url,
    media_id: item.media_id,
    thumbnail_url_hq: item.thumbnail_url_hq,
    thumbnail_url: item.thumbnail_url,
  })
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
    playback_url?: string | null
    poster_url?: string | null
    status?: string | null
    media_kind?: string | null
    caption?: string | null
    caption_hidden?: boolean | null
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
  const caption = item.caption || null
  const captionHidden = item.caption_hidden ?? false
  const [captionVisible, setCaptionVisible] = useState(!captionHidden && !!caption)

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

  // ── Pay / "yours" CTA — early return for same reason as thought: render_mode
  // can be 'embed' from identity intake, which would route to ContentCard.
  if (
    item.type === 'payment' ||
    (item.url && (item.url.includes('buy.stripe.com') || item.url.includes('checkout.stripe.com')))
  ) {
    return (
      <a
        href="/home"
        className="w-full h-full flex flex-col items-center justify-center p-6 group cursor-pointer no-underline relative"
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 70%)',
          borderRadius: 'inherit',
          textDecoration: 'none',
        }}
        data-tile-id={item.id}
        data-tile-type="cta"
      >
        <span className="text-white/90 text-center block" style={{ fontSize: 'clamp(28px, 8vw, 56px)', fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1 }}>yours</span>
        <span className="text-white/35 group-hover:text-white/60 transition-colors mt-3 text-center block" style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}>make one →</span>
      </a>
    )
  }

  // ── Thought tile — early return, type takes priority over render_mode.
  // Some thought rows carry render_mode='preview_card' or 'embed' from the
  // identity intake layer, which would otherwise route them to ContentCard
  // before the TextExpandTile branch fires. Platform is source of truth.
  if (item.type === 'thought') {
    return (
      <div
        className="fp-text-tile-shell w-full h-full"
        style={{ background: 'rgba(255,255,255,0.04)' }}
        data-tile-id={item.id}
        data-tile-type="thought"
      >
        <TextExpandTile text={item.title || ''} isPublicView={mode === 'public'} />
      </div>
    )
  }

  // ── Depth Tile — flag-gated portal tiles (Grailed et al.) ──
  if (item.url) {
    const depthProvider = matchDepthProvider(item.url)
    if (depthProvider) {
      return (
        <div className="w-full h-full" data-tile-id={item.id} data-tile-type="depth">
          <DepthTile provider={depthProvider} url={item.url} />
        </div>
      )
    }
  }

  // ── RenderMode-driven dispatch (new-style tiles) ──
  // Only fires for renderMode values produced by the identity intake layer.
  // Legacy tiles with render_mode 'ghost' or 'embed' skip this entirely.
  if (isNewStyleRenderMode(item.render_mode)) {
    const rm = item.render_mode as RenderMode
    switch (rm) {
      case 'native_video':
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="native-video">
            <video src={item.url && !item.url.includes('#') ? `${item.url}#t=0.1` : item.url} className="w-full h-full object-cover" muted loop playsInline preload="metadata" autoPlay />
          </div>
        )
      case 'embed':
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="embed">
            <ContentCard
              content={{
                id: item.id,
                url: item.url,
                type: item.type,
                title: item.title,
                description: item.description,
                thumbnail_url: item.thumbnail_url,
                embed_html: item.embed_html,
                artist: item.artist,
                thumbnail_url_hq: item.thumbnail_url_hq,
              }}
              tileSize={size}
              aspect={aspect}
              isPublicView={mode === 'public'}
              isExpanded={isExpanded}
              isMobile={isMobile}
            />
          </div>
        )
      case 'preview_card':
        const previewThumbnailCandidates = getPreviewThumbnailCandidates(item)
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="preview-card">
            <PreviewCardTileBase
              url={item.url}
              thumbnailUrl={previewThumbnailCandidates[0] || item.thumbnail_url_hq || item.thumbnail_url}
              title={item.title}
              subtitle={item.artist || null}
              cropThumbnail={shouldCropPreviewThumbnail(item.type, item.url, item.media_kind)}
              thumbnailCandidates={previewThumbnailCandidates}
            />
          </div>
        )
      case 'native_music':
        // Future: native music player. For now, preview card.
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="native-music">
            <PreviewCardTileBase
              url={item.url}
              thumbnailUrl={item.thumbnail_url_hq || item.thumbnail_url}
              title={item.title}
              subtitle={item.artist || null}
            />
          </div>
        )
      case 'link_only':
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="link-only">
            <PreviewCardTileBase
              url={item.url}
              thumbnailUrl={null}
              title={item.title}
              subtitle={null}
            />
          </div>
        )
    }
  }

  // ── Ghost tile — checked BEFORE canonicalType resolution ──
  // render_mode='ghost' tiles must reach GhostTile regardless of URL shape.
  // mediaTypeFromUrl defaults to 'image' for any non-video URL, which would
  // intercept Twitter/TikTok/Instagram tiles before the ghost check ran.
  const AUDIO_PLATFORMS = ['spotify', 'soundcloud', 'youtube', 'vimeo']
  const forceGhost = isSoundRoom && AUDIO_PLATFORMS.includes(item.type)
  const derivedGhostMediaId =
    item.type === 'youtube'
      ? extractYouTubeId(item.url || '')
      : item.type === 'vimeo'
      ? item.url.match(/vimeo\.com\/(\d+)/)?.[1] || null
      : null
  const ghostMediaId = item.media_id || derivedGhostMediaId || (item.type === 'spotify' ? item.id : null)
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
          clip_start_ms={(item as any).clip_start_ms ?? undefined}
          clip_end_ms={(item as any).clip_end_ms ?? undefined}
        />
      </div>
    )
  }

  const canonicalType = resolveCanonicalType(item.type, item.url || '', item.media_kind)
  const isAuto = aspect === 'auto'

  // ── Thought (safety net) ──
  // Primary catch is the type-based early return above (fires before the
  // identity-layer dispatch). This branch catches any edge case where
  // canonicalType resolves to 'thought' from a URL-based inference.
  if (canonicalType === 'thought') {
    const text = item.title || ''
    return (
      <div
        className="fp-text-tile-shell w-full h-full"
        style={{ background: 'rgba(255,255,255,0.04)' }}
        data-tile-id={item.id}
        data-tile-type="thought"
      >
        <TextExpandTile text={text} isPublicView={mode === 'public'} />
      </div>
    )
  }

  // ── Video (library-sourced .mp4/.mov files) ──
  if (canonicalType === 'video' && item.url) {
    return (
      <div className="w-full h-full relative" data-tile-id={item.id} data-tile-type="video">
        <div className="absolute inset-0 cursor-pointer" onClick={(e) => {
          const v = e.currentTarget.querySelector('video')
          if (!v) return
          v.muted = !v.muted
          const dot = e.currentTarget.querySelector('[data-mute-dot]') as HTMLElement
          if (dot) dot.style.opacity = v.muted ? '0.35' : '0.9'
        }}>
          <video
            src={item.url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
          />
          <div data-mute-dot className="absolute bottom-2.5 right-2.5 pointer-events-none transition-opacity duration-300" style={{ opacity: 0.35 }}>
            <div className="w-2 h-2 rounded-full" style={{ background: '#fff' }} />
          </div>
        </div>
      </div>
    )
  }

  // ── Image ──
  if (canonicalType === 'image') {
    if (mode === 'public') {
      return (
        <div
          className={`${isAuto && layout === 'editorial' ? 'w-full' : 'w-full h-full'} relative`}
          data-tile-id={item.id}
          data-tile-type="image"
        >
          {caption ? (
            <div
              className="w-full h-full outline-none"
              onClick={(e) => { e.stopPropagation(); setCaptionVisible(v => !v) }}
              style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              <TileImage
                src={item.url}
                alt={item.title || ''}
                sizes="(max-width: 768px) 50vw, 440px"
                index={index}
                aspect={aspect}
                layout={layout}
                size={size}
              />
              {captionVisible && (
                <div
                  className="absolute bottom-0 inset-x-0 px-4 py-2.5 bg-black/35 backdrop-blur-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-white/70 text-xs font-mono leading-relaxed m-0">{caption}</p>
                </div>
              )}
            </div>
          ) : (
            <ZoomableImage>
              <TileImage
                src={item.url}
                alt={item.title || ''}
                sizes="(max-width: 768px) 50vw, 440px"
                index={index}
                aspect={aspect}
                layout={layout}
                size={size}
              />
            </ZoomableImage>
          )}
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
          size={size}
        />
      </div>
    )
  }

  // ── "yours" CTA tile — invites visitors to build their own ──
  // Rubin-pass: this is the single ask on the page. Make it breathe.
  // Hero type, no chrome, the whole tile is the target. Subtle 2-line
  // hierarchy (action → label) reads cleanly at any size.
  const isPaymentLink = item.url && (
    item.url.includes('buy.stripe.com') ||
    item.url.includes('checkout.stripe.com') ||
    item.type === 'payment'
  )
  if (isPaymentLink) {
    return (
      <a
        href="/home"
        className="w-full h-full flex flex-col items-center justify-center p-6 group cursor-pointer no-underline relative"
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 70%)',
          borderRadius: 'inherit',
          textDecoration: 'none',
        }}
        data-tile-id={item.id}
        data-tile-type="cta"
      >
        <span
          className="text-white/90 text-center block"
          style={{ fontSize: 'clamp(28px, 8vw, 56px)', fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1 }}
        >
          yours
        </span>
        <span
          className="text-white/35 group-hover:text-white/60 transition-colors mt-3 text-center block"
          style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}
        >
          make one →
        </span>
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

  // ── Sealed exit — no renderer matched, drop the tile ──
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[UnifiedTile] Dropped unrenderable tile', {
      id: item.id,
      type: item.type,
      canonicalType,
      url: item.url,
    })
  }
  return null
}
