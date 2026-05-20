'use client'

import { memo, useState, useRef, useEffect, useCallback } from 'react'
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
import { sanitizeLinkMeta } from '@/lib/link-object'
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
    thumbnail_url_override?: string | null
    _temp?: boolean
    text_style?: 'clean' | 'editorial' | 'mono' | null
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

function VideoTile({ url, id, posterUrl }: { url: string; id: string; posterUrl?: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isInView, setIsInView] = useState(false)
  const [isActivated, setIsActivated] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const pendingPlayRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          obs.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const playVideo = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    pendingPlayRef.current = false
    setIsActivated(true)
    v.play().catch(() => {
      pendingPlayRef.current = true
    })
  }, [])

  const shouldLoadVideo = isInView || isActivated
  const videoSrc = shouldLoadVideo ? url : undefined
  const showPosterSurface = !!posterUrl && !isPlaying

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      data-tile-id={id}
      data-tile-type="video"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-transparent border-0 p-0"
        onClick={() => {
          const v = videoRef.current
          if (!v) return
          if (v.paused) playVideo()
          else v.pause()
        }}
        aria-label={isPlaying ? 'Pause video' : 'Play video'}
      >
        {showPosterSurface ? (
          <img
            src={posterUrl || undefined}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : null}
        <video
          ref={videoRef}
          poster={posterUrl || undefined}
          src={videoSrc}
          className={`block w-full h-full object-cover transition-opacity duration-200 ${showPosterSurface ? 'opacity-0' : 'opacity-100'}`}
          playsInline
          preload={isActivated ? 'auto' : isInView ? 'metadata' : 'none'}
          onCanPlay={() => {
            if (pendingPlayRef.current) playVideo()
          }}
          onLoadedData={() => {
            if (pendingPlayRef.current) playVideo()
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
        {showPosterSurface ? (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 52,
                height: 52,
                background: 'rgba(0,0,0,0.42)',
                backdropFilter: 'blur(12px) saturate(135%)',
                WebkitBackdropFilter: 'blur(12px) saturate(135%)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white ml-0.5" aria-hidden="true">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.3-6.86a1 1 0 0 0 0-1.66L9.53 4.29A1 1 0 0 0 8 5.14Z" />
              </svg>
            </span>
          </span>
        ) : null}
      </button>
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
  const caption = item.caption || null
  const captionHidden = item.caption_hidden ?? false
  const [captionVisible, setCaptionVisible] = useState(!captionHidden && !!caption)
  // Resync visibility when the owner flips visible ↔ tap-to-reveal in the
  // editor, or when a different tile takes this slot. Without this, the
  // initial `useState` value sticks and the public view (or a re-render after
  // PATCH) doesn't reflect the chosen mode until full reload.
  useEffect(() => {
    setCaptionVisible(!captionHidden && !!caption)
  }, [item.id, captionHidden, caption])

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

  // ── Pay / link tile — early return for same reason as thought: render_mode
  // can be 'embed' from identity intake, which would route to ContentCard.
  //
  // Authoring rule: a payment/Stripe tile with a user-set title or a
  // thumbnail override is rendered as a real authored link tile (opens the
  // destination in a new tab via PreviewCardTileBase). With neither set
  // it falls back to the canonical claim CTA pointing at /home.
  if (
    item.type === 'payment' ||
    (item.url && (item.url.includes('buy.stripe.com') || item.url.includes('checkout.stripe.com')))
  ) {
    const authored = Boolean((item.title && item.title.trim()) || item.thumbnail_url_override || item.thumbnail_url)
    if (authored && item.url) {
      return (
        <div className="w-full h-full" data-tile-id={item.id} data-tile-type="payment-authored">
          <PreviewCardTileBase
            url={item.url}
            thumbnailUrl={item.thumbnail_url_override || item.thumbnail_url || null}
            title={item.title || null}
            subtitle={null}
          />
        </div>
      )
    }
    return (
      <a
        href="/home"
        className="w-full h-full flex flex-col items-center justify-center p-6 group cursor-pointer no-underline relative"
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.06) 70%)',
          borderRadius: 'inherit',
          textDecoration: 'none',
        }}
        data-tile-id={item.id}
        data-tile-type="cta"
      >
        <span className="text-white/85 group-hover:text-white transition-colors text-center block" style={{ fontSize: 'clamp(16px, 3.4vw, 22px)', fontWeight: 400, letterSpacing: '0.01em', lineHeight: 1.2 }}>own your footprint →</span>
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
        style={{ background: 'transparent' }}
        data-tile-id={item.id}
        data-tile-type="thought"
      >
        <TextExpandTile text={item.title || ''} isPublicView={mode === 'public'} textStyle={item.text_style} />
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
            {item.url ? <VideoTile url={item.url} id={item.id} posterUrl={item.poster_url || null} /> : null}
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
              isSoundRoom={isSoundRoom}
            />
          </div>
        )
      case 'preview_card': {
        // TikTok with a canonical numeric video ID routes through ContentCard
        // so click-to-play inline iframe (audio on) works instead of a
        // dead-link card. vm.tiktok.com shortcodes don't resolve at the
        // player endpoint and continue to use the preview card.
        if (item.type === 'tiktok' && /tiktok\.com\/@[^/]+\/video\/\d+/.test(item.url || '')) {
          return (
            <div className="w-full h-full" data-tile-id={item.id} data-tile-type="tiktok-inline">
              <ContentCard
                content={{
                  id: item.id,
                  url: item.url,
                  type: item.type,
                  title: item.title,
                  description: item.description,
                  thumbnail_url: item.thumbnail_url,
                  embed_html: item.embed_html,
                  external_id: item.media_id,
                  artist: item.artist,
                  thumbnail_url_hq: item.thumbnail_url_hq,
                }}
                tileSize={size}
                aspect={aspect}
                isPublicView={mode === 'public'}
                isExpanded={isExpanded}
                isMobile={isMobile}
                isSoundRoom={isSoundRoom}
              />
            </div>
          )
        }
        const previewThumbnailCandidates = getPreviewThumbnailCandidates(item)
        const previewMeta = sanitizeLinkMeta({ title: item.title, creator: item.artist }, item.url || '')
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="preview-card">
            <PreviewCardTileBase
              url={item.url}
              thumbnailUrl={item.thumbnail_url_override || previewThumbnailCandidates[0] || item.thumbnail_url_hq || item.thumbnail_url}
              title={previewMeta.title}
              subtitle={previewMeta.creator}
              cropThumbnail={shouldCropPreviewThumbnail(item.type, item.url, item.media_kind)}
              thumbnailCandidates={previewThumbnailCandidates}
            />
          </div>
        )
      }
      case 'native_music': {
        // Future: native music player. For now, preview card.
        const musicMeta = sanitizeLinkMeta({ title: item.title, creator: item.artist }, item.url || '')
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="native-music">
            <PreviewCardTileBase
              url={item.url}
              thumbnailUrl={item.thumbnail_url_hq || item.thumbnail_url}
              title={musicMeta.title}
              subtitle={musicMeta.creator}
            />
          </div>
        )
      }
      case 'link_only': {
        const linkMeta = sanitizeLinkMeta({ title: item.title }, item.url || '')
        return (
          <div className="w-full h-full" data-tile-id={item.id} data-tile-type="link-only">
            <PreviewCardTileBase
              url={item.url}
              thumbnailUrl={item.thumbnail_url_override || item.thumbnail_url || null}
              title={linkMeta.title}
              subtitle={null}
            />
          </div>
        )
      }
    }
  }

  // ── Ghost tile — checked BEFORE canonicalType resolution ──
  // render_mode='ghost' tiles must reach GhostTile regardless of URL shape.
  // mediaTypeFromUrl defaults to 'image' for any non-video URL, which would
  // intercept Twitter/TikTok/Instagram tiles before the ghost check ran.
  //
  // Video platforms (youtube/vimeo + uploaded video) are NEVER ghosted —
  // even in the sound room. A music video is still a video; the compact
  // ghost UI hides the thumbnail and reads as "empty" to viewers. They
  // fall through to the preview-card / embed branches below.
  const VIDEO_PLATFORMS = new Set(['youtube', 'vimeo', 'video'])
  const isVideoPlatform = VIDEO_PLATFORMS.has(item.type)
  const AUDIO_PLATFORMS = ['spotify', 'soundcloud']
  const forceGhost = isSoundRoom && AUDIO_PLATFORMS.includes(item.type)
  const derivedGhostMediaId =
    item.type === 'youtube'
      ? extractYouTubeId(item.url || '')
      : item.type === 'vimeo'
      ? item.url.match(/vimeo\.com\/(\d+)/)?.[1] || null
      : null
  const ghostMediaId = item.media_id || derivedGhostMediaId || (item.type === 'spotify' ? item.id : null)
  // TikTok player URL (tiktok.com/player/v1/{id}) only accepts numeric video
  // IDs. vm.tiktok.com shortcodes stored as media_id render TikTok's "Server
  // Error" page. Skip GhostTile and fall through to the preview-card path.
  const ghostMediaIdValidForPlatform =
    item.type !== 'tiktok' || (!!ghostMediaId && /^\d+$/.test(ghostMediaId))
  if (!isVideoPlatform && (item.render_mode === 'ghost' || forceGhost) && ghostMediaId && ghostMediaIdValidForPlatform) {
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
          displayMode={aspect === 'wide' || aspect === 'landscape' ? 'player' : 'cover'}
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
        style={{ background: 'transparent' }}
        data-tile-id={item.id}
        data-tile-type="thought"
      >
        <TextExpandTile text={text} isPublicView={mode === 'public'} />
      </div>
    )
  }

  // ── Video (library-sourced .mp4/.mov files) ──
  if (canonicalType === 'video' && item.url) {
    if (item._temp) {
        return <VideoTile url={item.url} id={item.id} posterUrl={item.poster_url || null} />
      }
    return <VideoTile url={item.url} id={item.id} posterUrl={item.poster_url || null} />
  }

  // ── Image ──
  if (canonicalType === 'image') {
    if (mode === 'public') {
      return (
        <div
          className="w-full h-full relative"
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

  // ── Payment link safety net — same authoring rule as the early-return
  // branch above. Authored (custom title or thumbnail) → PreviewCardTileBase
  // opens the destination; unauthored → canonical claim CTA fallback.
  const isPaymentLink = item.url && (
    item.url.includes('buy.stripe.com') ||
    item.url.includes('checkout.stripe.com') ||
    item.type === 'payment'
  )
  if (isPaymentLink) {
    const authored = Boolean((item.title && item.title.trim()) || item.thumbnail_url_override || item.thumbnail_url)
    if (authored && item.url) {
      return (
        <div className="w-full h-full" data-tile-id={item.id} data-tile-type="payment-authored">
          <PreviewCardTileBase
            url={item.url}
            thumbnailUrl={item.thumbnail_url_override || item.thumbnail_url || null}
            title={item.title || null}
            subtitle={null}
          />
        </div>
      )
    }
    return (
      <a
        href="/home"
        className="w-full h-full flex flex-col items-center justify-center p-6 group cursor-pointer no-underline relative"
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.06) 70%)',
          borderRadius: 'inherit',
          textDecoration: 'none',
        }}
        data-tile-id={item.id}
        data-tile-type="cta"
      >
        <span
          className="text-white/85 group-hover:text-white transition-colors text-center block"
          style={{ fontSize: 'clamp(16px, 3.4vw, 22px)', fontWeight: 400, letterSpacing: '0.01em', lineHeight: 1.2 }}
        >
          own your footprint →
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
          isSoundRoom={isSoundRoom}
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
