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
import { tryNativeFullscreen, tryVideoEnterFullscreen } from '@/lib/fullscreen'

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

function VideoTile({ url, id }: { url: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isInView, setIsInView] = useState(false)
  // Decoder cap: only autoplay when the tile is at least half visible.
  // In a typical grid, this naturally caps simultaneous plays to ~2 — you
  // can't fit 4+ tiles each ≥50% visible. Off-cap tiles freeze on the last
  // frame (or poster), which still reads as "alive" without burning N decoders.
  const [isPlayable, setIsPlayable] = useState(false)
  // Mobile tap-reveal-fade for the fullscreen chip. Uploaded video does
  // get real native fullscreen on iOS via webkitEnterFullscreen, so this
  // chip is never dead — but the spec asks for the same reveal pattern
  // across all video surfaces so mobile doesn't accumulate permanent chrome.
  const [chipRevealed, setChipRevealed] = useState(false)
  const chipFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealChip = useCallback(() => {
    setChipRevealed(true)
    if (chipFadeTimerRef.current) clearTimeout(chipFadeTimerRef.current)
    chipFadeTimerRef.current = setTimeout(() => setChipRevealed(false), 1500)
  }, [])
  useEffect(() => () => {
    if (chipFadeTimerRef.current) clearTimeout(chipFadeTimerRef.current)
  }, [])

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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setIsPlayable(entry.isIntersecting),
      { threshold: 0.5 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isPlayable) v.play().catch(() => {})
    else v.pause()
  }, [isPlayable])

  // #t=0.1 forces desktop Chrome to paint the first frame as poster.
  // Without it the tile renders black until autoplay kicks in (and
  // Chrome increasingly blocks even muted autoplay). Mobile Safari is fine.
  const videoSrc = isInView
    ? (url.includes('#') ? url : `${url}#t=0.1`)
    : undefined

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative group"
      data-tile-id={id}
      data-tile-type="video"
      onPointerDown={revealChip}
    >
      <div className="absolute inset-0 cursor-pointer" onClick={(e) => {
        const v = e.currentTarget.querySelector('video')
        if (!v) return
        v.muted = !v.muted
        const dot = e.currentTarget.querySelector('[data-mute-dot]') as HTMLElement
        if (dot) dot.style.opacity = v.muted ? '0.35' : '0.9'
      }}>
        <video
          ref={videoRef}
          src={videoSrc}
          className="block w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay={isPlayable}
          preload={isInView ? 'metadata' : 'none'}
        />
        <div data-mute-dot className="absolute bottom-2.5 left-2.5 pointer-events-none transition-opacity duration-300" style={{ opacity: 0.35 }}>
          <div className="w-2 h-2 rounded-full" style={{ background: '#fff' }} />
        </div>
      </div>
      <button
        type="button"
        aria-label="Fullscreen"
        onClick={(e) => {
          e.stopPropagation()
          // Uploaded video has the real fullscreen API on every supported
          // platform: webkitEnterFullscreen for iOS Safari (the only path
          // that surfaces the native player chrome), requestFullscreen for
          // everything else. Container fallback is the safety net for
          // browsers that reject the video element specifically.
          const v = videoRef.current
          if (tryVideoEnterFullscreen(v)) return
          tryNativeFullscreen(v).then((ok) => {
            if (ok) return
            tryNativeFullscreen(containerRef.current)
          })
        }}
        className="absolute flex items-center justify-center text-white/85 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-300"
        style={{
          bottom: 12,
          right: 12,
          width: 28,
          height: 28,
          borderRadius: 999,
          zIndex: 3,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
          // Inline override drives the mobile reveal-fade; undefined falls
          // through to the Tailwind opacity-0 / group-hover pair on desktop.
          opacity: chipRevealed ? 1 : undefined,
          pointerEvents: 'auto',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
        </svg>
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
            {item.url ? <VideoTile url={item.url} id={item.id} /> : null}
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
      case 'preview_card': {
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
    return <VideoTile url={item.url} id={item.id} />
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
