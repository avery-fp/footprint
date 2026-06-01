'use client'

import { useState, useRef, useEffect, useCallback, type PointerEvent } from 'react'
import type { ContentType } from '@/lib/parser'
import { detectVariant } from '@/lib/parser'
import { audioManager } from '@/lib/audio-manager'
import { parseEmbed, extractYouTubeId, extractYouTubeStart, buildYouTubeEmbedUrl } from '@/lib/parseEmbed'
import type { EmbedResult } from '@/lib/parseEmbed'
import GlassEmbedFrameExtracted, { GlassPlaceholder as GlassPlaceholderExtracted } from '@/components/GlassEmbedFrame'
import { transformImageUrl } from '@/lib/image'
import { applyNextThumbnailFallback, applyThumbnailLoadGuard, getBestThumbnailUrl, getYouTubeThumbnailCandidates } from '@/lib/media/thumbnails'
import ArtifactShell from '@/components/ArtifactShell'
import SocialEmbed from '@/components/SocialEmbed'
import TextExpandTile from '@/components/TextExpandTile'
import FallbackCard from '@/components/FallbackCard'
import ArtifactTile from '@/components/ArtifactTile'
import MusicEmbedTile from '@/components/MusicEmbedTile'
import ReaderTile from '@/components/ReaderTile'
import { sanitizeLinkMeta, normalizeLinkObject } from '@/lib/link-object'
import {
  consumePendingYouTubeActivation,
  isYouTubePlayingMessage,
  nudgeYouTubeQuality,
  pauseYouTubePlayback,
  primeYouTubePlayer,
  requestYouTubeActivation,
  YOUTUBE_MOBILE_REVEAL_SETTLE_MS,
  shouldMountYouTubePlayer,
  shouldRevealYouTubePlayer,
  shouldShowYouTubePosterVeil,
  shouldUseYouTubePosterSurface,
  startYouTubePlayback,
  YOUTUBE_READY_SETTLE_MS,
} from '@/lib/youtube-player'
import { beginInvocation, isIntentionalInvocation, type InvocationPoint } from '@/lib/media-invocation'

// ════════════════════════════════════════
// Glass Embed Frame — imported from extracted component
// ════════════════════════════════════════

const GlassEmbedFrame = GlassEmbedFrameExtracted
const GlassPlaceholder = GlassPlaceholderExtracted

// ════════════════════════════════════════
// AE Embed Heights — stable per-provider defaults
// ════════════════════════════════════════

function getAEEmbedHeight(provider: string): number {
  switch (provider) {
    case 'youtube':    return 315
    case 'spotify':    return 152
    case 'tiktok':     return 580
    case 'soundcloud': return 166
    case 'vimeo':      return 315
    case 'twitter':    return 300
    case 'reddit':     return 400
    default:           return 400
  }
}

// ════════════════════════════════════════
// AE Dark Mode URL enforcement per provider
// ════════════════════════════════════════

function enforceEmbedDarkMode(url: string, provider: string): string {
  const sep = url.includes('?') ? '&' : '?'
  switch (provider) {
    case 'youtube':
      return url
    case 'spotify':
      if (!url.includes('theme=0')) return url + sep + 'theme=0'
      return url
    case 'soundcloud':
      // visual=true + white controls already dark; ensure color param
      if (!url.includes('color=')) return url + sep + 'color=%23000000'
      return url
    case 'vimeo':
      return url + (url.includes('color=') ? '' : sep + 'color=ffffff') + '&autoplay=1'
    default:
      return url
  }
}

function getExternalHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'source'
  } catch {
    return 'source'
  }
}

function isProductSource(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?depop\.com/i.test(url) || /\/products?\//i.test(url)
}

function extractPrice(text: string): string | null {
  return text.match(/(?:[$£€]\s?\d[\d,.]*(?:\.\d{2})?)/)?.[0] || null
}

interface ContentCardProps {
  content: {
    id: string
    url: string
    type: ContentType | string
    title: string | null
    description: string | null
    thumbnail_url: string | null
    embed_html: string | null
    external_id?: string | null
    artist?: string | null
    thumbnail_url_hq?: string | null
    thumbnail_url_override?: string | null
    metadata?: {
      product?: {
        name?: string | null
        image?: string | null
        description?: string | null
        price?: string | null
        priceCurrency?: string | null
        brand?: string | null
        seller?: string | null
        availability?: string | null
        condition?: string | null
      } | null
      excerpt_items?: Array<{
        title?: string | null
        url?: string | null
        date?: string | null
        description?: string | null
      }> | null
      site_name?: string | null
      domain?: string | null
      published_at?: string | null
      source_excerpt_category?: string | null
    } | null
  }
  onWidescreen?: () => void
  isMobile?: boolean
  tileSize?: number
  aspect?: string
  isPublicView?: boolean
  index?: number
  /** When true, show full embed immediately (no facade). Used in lightbox. */
  isExpanded?: boolean
  isSoundRoom?: boolean
}

/**
 * Content Card — Universal Embed Engine
 *
 * Zero-error contract: every URL renders something intentional.
 * parseEmbed → iframe tile (with silent fallback to link card)
 * null → link card (OG metadata via /api/og-preview)
 * Everything fails gracefully. No broken states.
 */
export default function ContentCard({ content, onWidescreen, isMobile = false, tileSize = 1, aspect = 'square', isPublicView = false, index = 999, isExpanded = false, isSoundRoom = false }: ContentCardProps) {
  // Size changes tile presence; explicit vertical media shape must survive.
  const isExplicitShape = aspect === 'square' || aspect === 'tall' || aspect === 'portrait'
  const effectiveAspect =
    tileSize === 2 && !isExplicitShape
      ? 'wide'
      : aspect
  const aspectClass = effectiveAspect === 'wide' ? 'aspect-video' : effectiveAspect === 'tall' ? 'aspect-[9/16]' : effectiveAspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-square'
  const fitClass = 'object-cover'
  const publicPosterClass = isPublicView ? ' fp-public-poster' : ''
  const isPriorityPoster = isPublicView && index < 10
  const posterDecoding = isPublicView && index < 6 ? 'sync' : 'async'
  const [isActivated, setIsActivated] = useState(false)
  const [youtubeHasStarted, setYoutubeHasStarted] = useState(false)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [shellOpen, setShellOpen] = useState(false)
  // Spec: AE Presentation Layer — Task 3. Thumb 404 → FallbackCard, not gray box.
  const [socialThumbFailed, setSocialThumbFailed] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoError, setIsVideoError] = useState(false)
  const [isVideoMuted, setIsVideoMuted] = useState(true)
  const [isNativeVideoActivated, setIsNativeVideoActivated] = useState(false)
  // Decoder cap: only autoplay when ≥50% visible. See videoRef effect below.
  const [isVideoPlayable, setIsVideoPlayable] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null)
  const audioIdRef = useRef(`card-${content.id}`)
  const activatedRef = useRef(false)
  const youtubePlayerReadyRef = useRef(false)
  const youtubePendingActivationRef = useRef(false)
  const youtubeRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const invocationPointRef = useRef<InvocationPoint | null>(null)
  const [youtubeRevealSettled, setYoutubeRevealSettled] = useState(false)
  // FIDELIO: Detect post vs profile for social embeds
  const socialVariant = detectVariant(content.type, content.url)
  const hasSocialEmbed = ['twitter', 'tiktok', 'instagram'].includes(content.type)

  // IntersectionObserver — only load content when near viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting)
        if (entry.isIntersecting) setIsInView(true)
      },
      { rootMargin: '900px 0px 900px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Decoder cap for native video tiles: 50%-visibility gate so the grid
  // doesn't stack N concurrent decoders (stutters on low-end Android).
  useEffect(() => {
    if (content.type !== 'video') return
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setIsVideoPlayable(entry.isIntersecting),
      { threshold: 0.5 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [content.type])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isVideoPlayable || isNativeVideoActivated) v.play().catch(() => {})
    else v.pause()
  }, [isVideoPlayable, isNativeVideoActivated])

  const stopCardAudio = useCallback(() => {
    if (content.type === 'youtube') {
      pauseYouTubePlayback(youtubeIframeRef.current)
      if (youtubeRevealTimerRef.current) {
        clearTimeout(youtubeRevealTimerRef.current)
        youtubeRevealTimerRef.current = null
      }
      youtubePendingActivationRef.current = false
      activatedRef.current = false
      audioManager.release(audioIdRef.current)
      setIsActivated(false)
      setYoutubeHasStarted(false)
      setYoutubeRevealSettled(false)
    } else if (content.type === 'soundcloud' || content.type === 'spotify' || content.type === 'tiktok') {
      activatedRef.current = false
      setIsActivated(false)
      setShellOpen(false)
    }
    const video = videoRef.current
    if (video) {
      audioManager.silenceNativeMedia(video)
      setIsVideoMuted(true)
      setIsNativeVideoActivated(false)
    }
  }, [content.type])

  // Register audio-producing types with AudioManager
  useEffect(() => {
    const isAudioType = ['youtube', 'soundcloud', 'spotify', 'video', 'tiktok'].includes(content.type)
    if (!isAudioType) return
    audioManager.register(audioIdRef.current, stopCardAudio)
    return () => {
      audioManager.release(audioIdRef.current)
      audioManager.unregister(audioIdRef.current)
    }
  }, [content.type, content.id, stopCardAudio])

  const handleActivate = () => {
    if (['youtube', 'soundcloud', 'spotify', 'tiktok'].includes(content.type)) {
      audioManager.activateProvider(audioIdRef.current)
    }
    activatedRef.current = true
    setIsActivated(true)
    if (content.type === 'youtube') {
      setYoutubeHasStarted(false)
      setYoutubeRevealSettled(false)
      if (youtubeRevealTimerRef.current) {
        clearTimeout(youtubeRevealTimerRef.current)
        youtubeRevealTimerRef.current = null
      }
      const activation = requestYouTubeActivation(youtubePlayerReadyRef.current)
      youtubePendingActivationRef.current = activation.pendingActivation
      if (activation.shouldPlayNow) startYouTubePlayback(youtubeIframeRef.current)
    }
  }

  const handleNativeVideoAudioToggle = () => {
    const video = videoRef.current
    if (!video) return
    if (video.muted) {
      setIsNativeVideoActivated(true)
      audioManager.playNative(audioIdRef.current, video)
      setIsVideoMuted(false)
      video.play().catch(() => {})
    } else {
      setIsNativeVideoActivated(false)
      audioManager.release(audioIdRef.current)
      audioManager.silenceNativeMedia(video)
      setIsVideoMuted(true)
    }
  }

  const handleInvocationPointerDown = (e: PointerEvent<HTMLElement>, invoke: () => void) => {
    e.stopPropagation()
    if (e.pointerType === 'mouse') {
      invoke()
      return
    }
    invocationPointRef.current = beginInvocation(e.pointerId, e.clientX, e.clientY)
  }

  const handleInvocationPointerUp = (e: PointerEvent<HTMLElement>, invoke: () => void) => {
    e.stopPropagation()
    if (e.pointerType === 'mouse') return
    const shouldInvoke = isIntentionalInvocation(invocationPointRef.current, e.pointerId, e.clientX, e.clientY)
    invocationPointRef.current = null
    if (shouldInvoke) invoke()
  }

  useEffect(() => {
    activatedRef.current = isActivated
  }, [isActivated])

  useEffect(() => {
    return () => {
      if (youtubeRevealTimerRef.current) clearTimeout(youtubeRevealTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setIsCoarsePointer(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    if (!isActivated || content.type !== 'youtube') return
    const onMessage = (e: MessageEvent) => {
      if (!['https://www.youtube-nocookie.com', 'https://www.youtube.com'].includes(e.origin)) return
      let data: unknown = e.data
      if (typeof data === 'string') {
        try { data = JSON.parse(data) } catch { return }
      }
      if (isYouTubePlayingMessage(data)) {
        setYoutubeHasStarted(true)
        if (!isSoundRoom) {
          if (youtubeRevealTimerRef.current) clearTimeout(youtubeRevealTimerRef.current)
          youtubeRevealTimerRef.current = setTimeout(() => {
            setYoutubeRevealSettled(true)
          }, isCoarsePointer ? YOUTUBE_MOBILE_REVEAL_SETTLE_MS : 0)
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [content.type, isActivated, isCoarsePointer, isSoundRoom])

  useEffect(() => {
    if (content.type !== 'youtube') return
    const onCollectionScroll = () => {
      pauseYouTubePlayback(youtubeIframeRef.current)
      if (youtubeRevealTimerRef.current) {
        clearTimeout(youtubeRevealTimerRef.current)
        youtubeRevealTimerRef.current = null
      }
      youtubePendingActivationRef.current = false
      activatedRef.current = false
      setIsActivated(false)
      setYoutubeHasStarted(false)
      setYoutubeRevealSettled(false)
    }
    window.addEventListener('fp:collection-scroll-start', onCollectionScroll)
    return () => window.removeEventListener('fp:collection-scroll-start', onCollectionScroll)
  }, [content.type])

  // ════════════════════════════════════════
  // YOUTUBE — FACADE: thumbnail first, iframe on tap
  // Surface-ownership law: YouTube iframe ONLY mounts after explicit user tap.
  // No isExpanded shortcut. No hover preview. No delayed activation.
  // ════════════════════════════════════════
  // Detect YouTube by URL, not just stored type — catches mistyped tiles
  const youtubeId = extractYouTubeId(content.url)
  const cachedYouTubeThumb = content.thumbnail_url ? transformImageUrl(content.thumbnail_url) : null
  const youtubeThumbCandidates = youtubeId
    ? Array.from(
        new Set([
          cachedYouTubeThumb,
          content.thumbnail_url_override ? transformImageUrl(content.thumbnail_url_override) : null,
          content.thumbnail_url_hq ? transformImageUrl(content.thumbnail_url_hq) : null,
          ...getYouTubeThumbnailCandidates({
            url: content.url,
            media_id: youtubeId,
            thumbnail_url_override: content.thumbnail_url_override,
            thumbnail_url: content.thumbnail_url,
            thumbnail_url_hq: content.thumbnail_url_hq,
          }),
        ].filter(Boolean) as string[])
      )
    : []
  if (youtubeId && !iframeFailed) {
    // The autoplay= URL param can be dropped when the iframe loads
    // asynchronously after the user's tap (gesture context expires before
    // the YouTube player initializes). Force playback via the JS API so
    // the user's first tap is the only one needed — no native YouTube
    // play button intermediate step. Unmute settles ~800ms later.
    const handleYTLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
      const iframe = e.currentTarget
      setTimeout(() => {
        primeYouTubePlayer(iframe, youtubeId)
        youtubePlayerReadyRef.current = true
        const activation = consumePendingYouTubeActivation(youtubePendingActivationRef.current)
        youtubePendingActivationRef.current = activation.pendingActivation
        if (activation.shouldPlayNow) {
          startYouTubePlayback(iframe)
        }
      }, YOUTUBE_READY_SETTLE_MS)
    }

    const isYouTubeShort = /\/shorts\//i.test(content.url || '')
    const shouldUsePosterSurface = shouldUseYouTubePosterSurface(isSoundRoom, isYouTubeShort, effectiveAspect)
    const shouldMountPlayer = shouldMountYouTubePlayer('youtube', isActivated, isCoarsePointer, isNearViewport)
    const shouldRevealFromReadyState =
      !isCoarsePointer && youtubePlayerReadyRef.current && !youtubePendingActivationRef.current
    const shouldRevealPlayer = shouldUsePosterSurface
      ? shouldRevealYouTubePlayer(isActivated, youtubeHasStarted, true, false, false)
      : shouldRevealYouTubePlayer(
          isActivated,
          youtubeHasStarted,
          false,
          shouldRevealFromReadyState,
          youtubeRevealSettled,
        )
    const shouldShowPosterVeil = shouldShowYouTubePosterVeil(isActivated, shouldRevealPlayer)

    if (!shouldMountPlayer) {
      return (
        <div
          ref={containerRef}
          className="w-full h-full fp-tile overflow-hidden relative group"
          style={{ background: 'transparent' }}
        >
          <div className="fp-resting-video-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={youtubeThumbCandidates[0]}
              alt=""
              className={`fp-resting-video-media${publicPosterClass}`}
              loading={isPriorityPoster ? 'eager' : 'lazy'}
              fetchPriority={isPriorityPoster ? 'high' : 'auto'}
              decoding={posterDecoding}
              referrerPolicy="no-referrer"
              ref={(img) => {
                if (img?.complete && img.naturalWidth) {
                  applyThumbnailLoadGuard(img, youtubeThumbCandidates)
                }
              }}
              onLoad={(e) => {
                applyThumbnailLoadGuard(e.currentTarget, youtubeThumbCandidates)
                setIsLoaded(true)
              }}
              onError={(e) => applyNextThumbnailFallback(e.currentTarget, youtubeThumbCandidates)}
            />
          </div>
          <button
            type="button"
            aria-label="Play video"
            onPointerDown={(e) => handleInvocationPointerDown(e, handleActivate)}
            onPointerUp={(e) => handleInvocationPointerUp(e, handleActivate)}
            onPointerCancel={() => { invocationPointRef.current = null }}
            className="absolute inset-0"
            style={{ zIndex: 3, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
          />
        </div>
      )
    }

    // The iframe may mount hidden as plumbing. The Footprint poster owns
    // loading/resting/paused; YouTube only becomes visible for motion.
    const ytActivatedSrc = buildYouTubeEmbedUrl(youtubeId, {
      autoplay: false,
      mute: true,
      start: extractYouTubeStart(content.url),
      hd: true,
    })
    return (
      <div
        ref={containerRef}
        className="w-full max-w-full h-full fp-tile overflow-hidden relative group"
        style={{ background: 'transparent' }}
      >
        <div
          className="absolute inset-0 w-full h-full [&_iframe]:!w-full [&_iframe]:!max-w-full [&_iframe]:!h-full"
          style={{
            opacity: shouldRevealPlayer ? 1 : 0,
            transition: 'opacity 0.2s ease',
            zIndex: 1,
          }}
        >
          <iframe
            ref={youtubeIframeRef}
            src={ytActivatedSrc}
            width={1920}
            height={1080}
            className="block w-full h-full"
            style={{
              border: 'none',
              aspectRatio: effectiveAspect === 'tall' ? '9 / 16' : effectiveAspect === 'portrait' ? '3 / 4' : '16 / 9',
              maxWidth: '100%',
              maxHeight: '100%',
            }}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={handleYTLoad}
          />
        </div>
        {shouldShowPosterVeil && (
          <button
            type="button"
            aria-label="Play video"
            onPointerDown={!isActivated ? (e) => handleInvocationPointerDown(e, handleActivate) : undefined}
            onPointerUp={!isActivated ? (e) => handleInvocationPointerUp(e, handleActivate) : undefined}
            onPointerCancel={() => { invocationPointRef.current = null }}
            className="absolute inset-0 cursor-pointer"
            style={{
              zIndex: 3,
              border: 'none',
              padding: 0,
              background: 'transparent',
              pointerEvents: isActivated ? 'none' : 'auto',
            }}
          >
            <div className="fp-resting-video-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={youtubeThumbCandidates[0]}
                alt=""
                className={`fp-resting-video-media${publicPosterClass}`}
                loading={isPriorityPoster ? 'eager' : 'lazy'}
                fetchPriority={isPriorityPoster ? 'high' : 'auto'}
                decoding={posterDecoding}
                referrerPolicy="no-referrer"
                ref={(img) => {
                  if (img?.complete && img.naturalWidth) {
                    applyThumbnailLoadGuard(img, youtubeThumbCandidates)
                  }
                }}
                onLoad={(e) => {
                  applyThumbnailLoadGuard(e.currentTarget, youtubeThumbCandidates)
                  setIsLoaded(true)
                }}
                onError={(e) => applyNextThumbnailFallback(e.currentTarget, youtubeThumbCandidates)}
              />
            </div>
          </button>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════
  // MUSIC — square = cover-first, wide = compact glass facade
  // ════════════════════════════════════════
  if (content.type === 'spotify' || content.type === 'apple_music') {
    const thumbSrc = getBestThumbnailUrl(content)
    const { title, creator } = sanitizeLinkMeta(
      { title: content.title, creator: content.artist },
      content.url
    )
    const isWideMusic = effectiveAspect === 'wide' || effectiveAspect === 'landscape'

    return (
      <MusicEmbedTile
        url={content.url}
        provider={content.type}
        title={title}
        artist={creator || undefined}
        image={thumbSrc}
        displayMode={content.type === 'spotify' ? 'player' : content.type === 'apple_music' ? 'cover' : isWideMusic ? 'player' : 'cover'}
      />
    )
  }

  // ════════════════════════════════════════
  // SOUNDCLOUD — facade first, click loads embed
  // ════════════════════════════════════════
  if (content.type === 'soundcloud' && !iframeFailed) {
    const embed = parseEmbed(content.url)
    if (!isActivated) {
      return (
        <div
          ref={containerRef}
          className={`w-full max-w-full ${aspectClass || 'aspect-square'} fp-tile overflow-hidden relative group`}
          style={{ background: 'transparent' }}
        >
          <button
            type="button"
            aria-label="Play audio"
            onClick={handleActivate}
            className="absolute inset-0"
            style={{ zIndex: 3, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
          />
        </div>
      )
    }
    if (embed) {
      const scSrc = enforceEmbedDarkMode(embed.embedUrl, 'soundcloud')
      const scHeight = embed.height || getAEEmbedHeight('soundcloud')
      return (
        <div
          ref={containerRef}
          className="w-full max-w-full fp-tile overflow-hidden"
          style={{ height: `${scHeight}px`, position: 'relative' }}
        >
          <GlassEmbedFrame
            src={scSrc}
            height={scHeight}
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-popups"
            onError={() => setIframeFailed(true)}
          />
          {/* Cover SoundCloud logo / branding at bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: '#000', zIndex: 2, pointerEvents: 'auto' }} />
        </div>
      )
    }
    // Fallback: use stored embed_html if parseEmbed didn't match
    if (content.embed_html) {
      return (
        <div
          className={`w-full max-w-full ${aspectClass} fp-tile overflow-hidden [&_iframe]:!w-full [&_iframe]:!max-w-full [&_iframe]:!h-full`}
          style={{ position: 'relative', background: 'transparent' }}
        >
          <div dangerouslySetInnerHTML={{ __html: content.embed_html }} className="w-full h-full" />
          {/* Cover SoundCloud branding in legacy embed_html */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: '#000', zIndex: 2, pointerEvents: 'auto' }} />
        </div>
      )
    }
  }

  // ════════════════════════════════════════
  // VIMEO — lazy loaded embed via GlassEmbedFrame
  // ════════════════════════════════════════
  if (content.type === 'vimeo' && !iframeFailed) {
    const embed = parseEmbed(content.url)
    if (embed) {
      const vimeoSrc = enforceEmbedDarkMode(embed.embedUrl, 'vimeo')
      return (
        <div ref={containerRef} className={`w-full max-w-full ${aspectClass || 'aspect-video'} fp-tile overflow-hidden relative`}>
          {isInView ? (
            <GlassEmbedFrame
              src={vimeoSrc}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-popups"
              onError={() => setIframeFailed(true)}
            />
          ) : (
            <GlassPlaceholder aspectClass={aspectClass || 'aspect-video'} />
          )}
          {/* Defensive click-blocker over Vimeo badge area */}
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 50, height: 36, zIndex: 2, pointerEvents: 'auto' }} />
        </div>
      )
    }
    // Fallback: stored embed_html
    if (content.embed_html) {
      return (
        <div ref={containerRef} className={`w-full max-w-full ${aspectClass || 'aspect-video'} fp-tile overflow-hidden relative`} style={{ background: 'transparent' }}>
          {isInView ? (
            <div
              className="absolute inset-0 [&_iframe]:!w-full [&_iframe]:!max-w-full [&_iframe]:!h-full"
              dangerouslySetInnerHTML={{ __html: content.embed_html }}
            />
          ) : (
            <GlassPlaceholder aspectClass={aspectClass || 'aspect-video'} />
          )}
          {/* Cover Vimeo badge in legacy embed_html */}
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 50, height: 36, zIndex: 2, pointerEvents: 'auto' }} />
        </div>
      )
    }
  }

  // ════════════════════════════════════════
  // VIDEO (native) — with vapor box
  // ════════════════════════════════════════
  if (content.type === 'video') {
    // Append #t=0.1 so the first frame renders as poster instead of a black square.
    // Skips if URL already has a fragment.
    const videoSrc = content.url && !content.url.includes('#') ? `${content.url}#t=0.1` : content.url
    return (
      <div ref={containerRef} className="fp-tile overflow-hidden relative group">
        {isVideoError ? (
          <GlassPlaceholder aspectClass={aspectClass || 'aspect-video'} />
        ) : isInView ? (
          <>
            <video
              ref={videoRef}
              src={videoSrc}
              muted={isVideoMuted}
              autoPlay={isVideoPlayable || isNativeVideoActivated}
              loop
              playsInline
              preload="metadata"
              poster={content.thumbnail_url || undefined}
              className={`block w-full ${aspectClass || 'aspect-video'} ${fitClass} cursor-pointer`}
              onLoadedData={() => setIsLoaded(true)}
              onPlay={() => setIsVideoPlaying(true)}
              onPause={(e) => {
                setIsVideoPlaying(false)
                if (!e.currentTarget.muted) audioManager.release(audioIdRef.current)
              }}
              onError={() => setIsVideoError(true)}
            />
            <button
              type="button"
              aria-label={isVideoMuted ? 'Play audio' : 'Mute audio'}
              onPointerDown={(e) => handleInvocationPointerDown(e, handleNativeVideoAudioToggle)}
              onPointerUp={(e) => handleInvocationPointerUp(e, handleNativeVideoAudioToggle)}
              onPointerCancel={() => { invocationPointRef.current = null }}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                zIndex: 3,
                border: 'none',
                background: 'transparent',
                opacity: 0,
                transition: 'opacity 180ms ease',
              }}
            />
          </>
        ) : (
          <div className={`w-full ${aspectClass || 'aspect-video'}`} style={{ background: 'transparent' }} />
        )}
      </div>
    )
  }

  // ════════════════════════════════════════
  // IMAGE — vapor box + 800ms materialization
  // ════════════════════════════════════════
  if (content.type === 'image') {
    return (
      <div ref={containerRef} className="fp-tile overflow-hidden relative">
        <a href={content.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={transformImageUrl(content.url)}
            alt={content.title || ''}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full h-full object-cover${publicPosterClass}`}
            loading={isPriorityPoster ? 'eager' : 'lazy'}
            fetchPriority={isPriorityPoster ? 'high' : 'auto'}
            decoding={posterDecoding}
            onLoad={(e) => {
              setIsLoaded(true)
              const img = e.currentTarget
              if (img.naturalWidth > img.naturalHeight * 1.3) {
                onWidescreen?.()
              }
            }}
          />
        </a>
      </div>
    )
  }

  // ════════════════════════════════════════
  // THOUGHT — text tile with glass background + E-State expansion
  // Spec: AE Presentation Layer — Task 1
  // ════════════════════════════════════════
  if (content.type === 'thought') {
    const text = content.title || content.description || ''
    return <TextExpandTile text={text} isPublicView={isPublicView} />
  }

  // ════════════════════════════════════════
  // TWITTER / X — glass tile, click-to-expand text artifact
  // Matched by URL, not stored type — seals pic.twitter.com and mistyped tiles.
  // Compact resting state; ArtifactShell opens source-specific excerpt.
  // ════════════════════════════════════════
  if (/(?:twitter\.com|x\.com)/i.test(content.url)) {
    const { title, creator } = sanitizeLinkMeta(
      { title: content.title, creator: content.artist, image: getBestThumbnailUrl(content), description: content.description },
      content.url
    )
    const handleMatch = content.url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/)
    const handle = creator || (handleMatch ? `@${handleMatch[1]}` : null)
    const isProfileExcerpt = !!handle && !content.description && (title === handle || title === 'X' || title === 'x.com')
    const excerptTitle = isProfileExcerpt ? handle : title || content.description || 'X'
    const excerptDescription = content.description && content.description !== excerptTitle ? content.description : ''

    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShellOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') setShellOpen(true) }}
          ref={containerRef as any}
          className={`block w-full h-full fp-tile overflow-hidden relative cursor-pointer ${aspectClass}`}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.07)',
          }}
        >
          <div className="absolute inset-0 flex flex-col justify-center px-4 py-3 gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[11px] font-medium text-white/55">
                {handle || 'x.com'}
              </span>
              <span className="shrink-0 text-[13px] font-light text-white/35 select-none">
                X
              </span>
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/80 line-clamp-7">
              {excerptTitle}
            </p>
          </div>
        </div>

        {shellOpen && (
          <ArtifactShell onDismiss={() => setShellOpen(false)} fallbackUrl={content.url}>
            <div className="mx-auto max-w-[440px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-[11px] font-medium text-white/50">
                  {handle || 'x.com'}
                </div>
                <div className="shrink-0 text-[11px] uppercase tracking-[0.22em] text-white/30">
                  X
                </div>
              </div>
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">
                {excerptTitle}
              </div>
              {isProfileExcerpt ? null : excerptDescription ? (
                <div className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-white/50">
                  {excerptDescription}
                </div>
              ) : null}
            </div>
          </ArtifactShell>
        )}
      </>
    )
  }

  // ════════════════════════════════════════
  // TIKTOK — facade thumbnail, inline iframe on tap (YouTube-style)
  // TikTok's official player accepts numeric video IDs at
  //   https://www.tiktok.com/player/v1/{id} — autoplay=1 with audio on.
  // vm.tiktok.com shortcodes don't resolve at the player endpoint, so those
  // fall through to ArtifactShell as a fallback path.
  // ════════════════════════════════════════
  if (content.type === 'tiktok') {
    const thumbSrc = getBestThumbnailUrl(content)
    // Numeric video ID from the canonical tiktok.com/@user/video/{id} shape.
    // external_id (when present) wins; otherwise extract from the URL.
    const tiktokId = (content.external_id && /^\d+$/.test(content.external_id))
      ? content.external_id
      : content.url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)?.[1] || null
    const canPlayInline = !!tiktokId

    // Thumb 404 or no content at all → FallbackCard. Spec Task 3.
    if (thumbSrc && socialThumbFailed) {
      return <FallbackCard platform="tiktok" title={content.title} url={content.url} aspectClass={aspectClass} />
    }
    if (!thumbSrc && !content.title) {
      return <FallbackCard platform="tiktok" title={null} url={content.url} aspectClass={aspectClass} />
    }

    const tiktokText = content.title || 'TikTok'
    const len = tiktokText.length
    const typo = len <= 60
      ? 'text-[14px] tracking-[-0.01em] leading-snug'
      : len <= 140
      ? 'text-[12px] tracking-[-0.005em] leading-relaxed'
      : 'text-[11px] tracking-normal leading-relaxed'

    // Activated state — iframe replaces the facade in the same tile.
    if (canPlayInline && isActivated && tiktokId) {
      const tiktokSrc = `https://www.tiktok.com/player/v1/${tiktokId}?autoplay=1&music_info=1&description=0&rel=0&closed_caption=0&loop=0&native_context_menu=0&progress_bar=1`
      return (
        <div
          ref={containerRef}
          className={`block w-full h-full fp-tile overflow-hidden relative ${aspectClass}`}
          style={{ background: '#000' }}
        >
          <iframe
            src={tiktokSrc}
            className="w-full h-full"
            style={{ border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )
    }

    // Resting tile bg: transparent only when an image will actually paint
    // behind the text. Without a thumb, transparent reads as a grey ghost
    // against the wrapper tint — fall back to frosted glass so the tile
    // looks intentional and the play affordance is legible.
    const hasVisualBg = !!thumbSrc && !socialThumbFailed
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            audioManager.activateProvider(audioIdRef.current)
            canPlayInline ? setIsActivated(true) : setShellOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              audioManager.activateProvider(audioIdRef.current)
              canPlayInline ? setIsActivated(true) : setShellOpen(true)
            }
          }}
          ref={containerRef as any}
          className={`block w-full h-full fp-tile overflow-hidden relative cursor-pointer ${aspectClass}`}
          style={{ background: 'transparent' }}
        >
          {thumbSrc && (
            <div className="fp-resting-video-frame z-[1]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc}
                alt=""
                className={`fp-resting-video-media${publicPosterClass}`}
                loading={isPriorityPoster ? 'eager' : 'lazy'}
                fetchPriority={isPriorityPoster ? 'high' : 'auto'}
                decoding={posterDecoding}
                onLoad={() => setIsLoaded(true)}
                onError={() => setSocialThumbFailed(true)}
              />
            </div>
          )}
          {/* Text overlay — caption atop thumb, readable via text-shadow */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 gap-3">
            <p
              className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow text-sm line-clamp-6`}
              style={{ fontWeight: 500 }}
            >
              {tiktokText}
            </p>
            {canPlayInline && !hasVisualBg && (
              <span
                className="text-white/40 uppercase tracking-widest font-mono"
                style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.18em' }}
              >
                tap to play
              </span>
            )}
          </div>
        </div>
        {shellOpen && (
          <ArtifactShell onDismiss={() => { setShellOpen(false); audioManager.release(audioIdRef.current) }} fallbackUrl={content.url}>
            <SocialEmbed url={content.url} type="tiktok" variant={socialVariant} onError={() => setShellOpen(false)} />
          </ArtifactShell>
        )}
      </>
    )
  }

  // ════════════════════════════════════════
  // INSTAGRAM — first-party closed state, ArtifactShell on tap
  // FIDELIO: No third-party scripts until shell opens
  // ════════════════════════════════════════
  if (content.type === 'instagram') {
    const thumbSrc = getBestThumbnailUrl(content)

    // Thumb 404 or no content at all → FallbackCard. Spec Task 3.
    if (thumbSrc && socialThumbFailed) {
      return <FallbackCard platform="instagram" title={content.title} url={content.url} aspectClass={aspectClass} />
    }
    if (!thumbSrc && !content.title) {
      return <FallbackCard platform="instagram" title={null} url={content.url} aspectClass={aspectClass} />
    }

    const igText = content.title || 'Instagram'
    const len = igText.length
    const typo = len <= 60
      ? 'text-[14px] tracking-[-0.01em] leading-snug'
      : len <= 140
      ? 'text-[12px] tracking-[-0.005em] leading-relaxed'
      : 'text-[11px] tracking-normal leading-relaxed'

    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShellOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') setShellOpen(true) }}
          ref={containerRef as any}
          className={`block w-full h-full fp-tile overflow-hidden relative cursor-pointer ${aspectClass}`}
          style={{ background: 'transparent' }}
        >
          {thumbSrc && (
            <div className="fp-resting-video-frame z-[1]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc}
                alt=""
                className={`fp-resting-video-media${publicPosterClass}`}
                loading={isPriorityPoster ? 'eager' : 'lazy'}
                fetchPriority={isPriorityPoster ? 'high' : 'auto'}
                decoding={posterDecoding}
                onLoad={() => setIsLoaded(true)}
                onError={() => setSocialThumbFailed(true)}
              />
            </div>
          )}
          {/* Text overlay — caption atop thumb */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5">
            <p
              className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow text-sm line-clamp-6`}
              style={{ fontWeight: 500 }}
            >
              {igText}
            </p>
          </div>
        </div>
        {shellOpen && (
          <ArtifactShell onDismiss={() => setShellOpen(false)} fallbackUrl={content.url}>
            <SocialEmbed url={content.url} type="instagram" variant={socialVariant} onError={() => setShellOpen(false)} />
          </ArtifactShell>
        )}
      </>
    )
  }

  // ════════════════════════════════════════
  // GENERIC EXTERNAL ARTIFACT — IG-style shell for ordinary links
  // Depop, RedBar, X/link cards, etc. stay inside Footprint first.
  // ════════════════════════════════════════
  const isGenericExternalArtifact =
    Boolean(content.url) &&
    content.type !== 'instagram' &&
    content.type !== 'tiktok' &&
    content.type !== 'native_music'

  if (isGenericExternalArtifact) {
    const thumbSrc =
      content.thumbnail_url_override ||
      content.thumbnail_url_hq ||
      content.thumbnail_url ||
      ''

    const host = getExternalHost(content.url)

    const displayTitle = content.title || host
    const displayDescription = content.description || content.artist || ''
    const productMeta = content.metadata?.product || null
    const excerptItems = (content.metadata?.excerpt_items || []).filter((item) => item?.title).slice(0, 3)
    const artifactImage = productMeta?.image || thumbSrc
    const hasArtifactImage = !!artifactImage && !socialThumbFailed
    const productArtifact = !!productMeta || isProductSource(content.url)
    const sourceTitle = productMeta?.name || displayTitle
    const sourceDescription = productMeta?.description || displayDescription
    const productPrice = productMeta?.price || extractPrice(`${content.title || ''} ${content.description || ''}`)
    const productSeller = productMeta?.seller || productMeta?.brand || content.artist || (productArtifact ? host : '')
    const productDescription = productPrice
      ? sourceDescription.replace(productPrice, '').trim()
      : sourceDescription
    const productTitle = productArtifact && (!content.title || content.title === host) ? host : sourceTitle
    const sourceName = content.metadata?.site_name || content.metadata?.domain || host
    const sourceDate = content.metadata?.published_at || ''
    const articleArtifact = !productArtifact && (
      content.metadata?.source_excerpt_category === 'article' ||
      !!sourceDescription ||
      hasArtifactImage ||
      excerptItems.length > 0
    )

    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShellOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setShellOpen(true)
          }}
          ref={containerRef as any}
          className={`block w-full h-full fp-tile overflow-hidden relative cursor-pointer ${aspectClass}`}
          style={{ background: 'transparent' }}
        >
          {hasArtifactImage ? (
            <div className="fp-resting-video-frame z-[1]">
              <img
                src={thumbSrc}
                alt=""
                className={`fp-resting-video-media${publicPosterClass}`}
                loading={isPriorityPoster ? 'eager' : 'lazy'}
                fetchPriority={isPriorityPoster ? 'high' : 'auto'}
                decoding={posterDecoding}
                onLoad={() => setIsLoaded(true)}
                onError={() => setSocialThumbFailed(true)}
              />
            </div>
          ) : null}

          <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center p-5">
            <p
              className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow text-sm line-clamp-6`}
              style={{ fontWeight: 500 }}
            >
              {sourceTitle}
            </p>

            <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">
              {host}
            </span>
          </div>
        </div>

        {shellOpen && (
          <ArtifactShell onDismiss={() => setShellOpen(false)} fallbackUrl={content.url}>
            {productArtifact ? (
              <div className={`mx-auto overflow-hidden rounded-2xl border border-white/10 bg-black/35 ${hasArtifactImage ? 'max-w-xl sm:flex' : 'max-w-[440px]'}`}>
                {hasArtifactImage ? (
                  <div className="flex items-center justify-center bg-black/25 sm:w-[48%]">
                    <img
                      src={artifactImage}
                      alt=""
                      className="max-h-[58vh] w-full object-contain"
                    />
                  </div>
                ) : null}

                <div className={`${hasArtifactImage ? 'p-5 sm:w-[52%]' : 'flex min-h-[175px] flex-col items-center justify-center p-8 text-center'}`}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">
                    {host}
                  </div>
                  <div className="mt-4 text-[16px] leading-snug text-white/85">
                    {productTitle}
                  </div>
                  {productPrice ? (
                    <div className="mt-3 text-[14px] font-medium text-white/75">
                      {productMeta?.priceCurrency ? `${productMeta.priceCurrency} ${productPrice}` : productPrice}
                    </div>
                  ) : null}
                  {productSeller ? (
                    <div className="mt-3 text-[12px] leading-relaxed text-white/45">
                      {productSeller}
                    </div>
                  ) : null}
                  {productMeta?.availability || productMeta?.condition ? (
                    <div className="mt-3 text-[11px] leading-relaxed text-white/35">
                      {[productMeta.availability, productMeta.condition].filter(Boolean).join(' · ')}
                    </div>
                  ) : null}
                  {productDescription ? (
                    <div className="mt-4 text-[12px] leading-relaxed text-white/50">
                      {productDescription}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : articleArtifact ? (
              <article className="mx-auto overflow-hidden rounded-2xl border border-white/10 bg-black/35">
                {hasArtifactImage ? (
                  <img
                    src={artifactImage}
                    alt=""
                    className="w-full max-h-[48vh] object-contain bg-black/25"
                  />
                ) : null}

                <div className="p-6 sm:p-7">
                  <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">
                    {[sourceName, sourceDate].filter(Boolean).join(' · ')}
                  </div>

                  <h2 className="mt-4 text-[20px] leading-tight text-white/88">
                    {sourceTitle}
                  </h2>

                  {sourceDescription ? (
                    <p className="mt-4 text-[14px] leading-relaxed text-white/58">
                      {sourceDescription}
                    </p>
                  ) : null}

                  {excerptItems.length > 0 ? (
                    <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
                      {excerptItems.map((item) => (
                        <div key={`${item.title}-${item.url || ''}`} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                          <div className="text-[12px] leading-snug text-white/75">
                            {item.title}
                          </div>
                          {item.description ? (
                            <div className="mt-1 text-[11px] leading-relaxed text-white/40 line-clamp-2">
                              {item.description}
                            </div>
                          ) : null}
                          {item.date ? (
                            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">
                              {item.date}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ) : (
              <div className={`mx-auto overflow-hidden rounded-2xl border border-white/10 bg-black/35 ${hasArtifactImage ? 'max-w-lg' : 'max-w-[440px]'}`}>
                {hasArtifactImage ? (
                  <img
                    src={artifactImage}
                    alt=""
                    className="w-full max-h-[62vh] object-contain"
                  />
                ) : (
                  <div className="flex min-h-[175px] items-center justify-center p-8 text-center">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-white/35">
                        {host}
                      </div>
                      <div className="mt-4 text-[15px] leading-snug text-white/80">
                        {sourceTitle}
                      </div>
                    </div>
                  </div>
                )}

                <div className={`${hasArtifactImage ? 'p-5' : 'px-6 pb-6 pt-0 text-center'}`}>
                  {sourceTitle && hasArtifactImage ? (
                    <div className="text-sm leading-relaxed text-white/80">
                      {sourceTitle}
                    </div>
                  ) : null}

                  {sourceDescription ? (
                    <div className="mt-2 text-xs leading-relaxed text-white/45">
                      {sourceDescription}
                    </div>
                  ) : null}

                  {excerptItems.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {excerptItems.map((item) => (
                        <div key={`${item.title}-${item.url || ''}`} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                          <div className="text-[12px] leading-snug text-white/75">
                            {item.title}
                          </div>
                          {item.description ? (
                            <div className="mt-1 text-[11px] leading-relaxed text-white/40 line-clamp-2">
                              {item.description}
                            </div>
                          ) : null}
                          {item.date ? (
                            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">
                              {item.date}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.24em] text-white/30">
                    {host}
                  </div>
                </div>
              </div>
            )}
          </ArtifactShell>
        )}
      </>
    )
  }

  // ════════════════════════════════════════
  // UNIVERSAL EMBED ENGINE — Tier 2 platforms (and Apple Music tier 1)
  // Bandcamp, Google Maps, CodePen, Are.na, Figma, Apple Music
  // Try iframe with 3s timeout → fallback to SmartLinkFallback
  //
  // Apple Music intentionally falls through to here. parseAppleMusic returns
  // a tier-1 embed (iframe at embed.music.apple.com) so the album art IS the
  // tile surface and Apple's own transport controls overlay on tap. This
  // matches the Spotify / video tile grammar: media owns the surface, chrome
  // appears on intent. The legacy MusicTile ghost-plate path was the wrong
  // default — kept available below as the SmartLinkFallback only when
  // parseAppleMusic can't produce an embed (malformed URL).
  // ════════════════════════════════════════
  const embed = parseEmbed(content.url)
  if (embed && !iframeFailed) {
    return (
      <Tier2EmbedTile
        embed={embed}
        isInView={isInView}
        onFail={() => setIframeFailed(true)}
      />
    )
  }

  // ════════════════════════════════════════
  // SMART LINK FALLBACK — ArtifactTile or ReaderTile
  // Fetches OG metadata, routes to appropriate tile.
  // ════════════════════════════════════════
  return (
    <SmartLinkFallback
      url={content.url}
      title={content.title}
      description={content.description}
      thumbnail={getBestThumbnailUrl(content)}
      thumbnailOverride={content.thumbnail_url_override || null}
      artist={content.artist}
      isInView={isInView}
      aspectClass={aspectClass}
      isPublicView={isPublicView}
    />
  )
}

// ════════════════════════════════════════════════════════════
// TIER 2 EMBED TILE — GlassEmbedFrame with 3s timeout, silent fallback
// ════════════════════════════════════════════════════════════

function Tier2EmbedTile({
  embed,
  isInView,
  onFail,
}: {
  embed: EmbedResult
  isInView: boolean
  onFail: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const localRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tier 2: 3-second timeout — if iframe doesn't load, swap to link card
  useEffect(() => {
    if (embed.tier !== 2 || !isInView) return
    timeoutRef.current = setTimeout(() => {
      if (!loaded) onFail()
    }, 3000)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [isInView, embed.tier, loaded, onFail])

  const handleGlassLoad = useCallback(() => {
    setLoaded(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const fallbackHeight = embed.height || getAEEmbedHeight(embed.platform)

  const style: React.CSSProperties = embed.aspectRatio
    ? { aspectRatio: embed.aspectRatio }
    : { height: `${fallbackHeight}px` }

  return (
    <div
      ref={localRef}
      className="w-full fp-tile overflow-hidden relative"
      style={{ ...style, maxWidth: '100%' }}
    >
      {isInView ? (
        <GlassEmbedFrame
          src={embed.embedUrl}
          height={embed.aspectRatio ? undefined : fallbackHeight}
          sandbox="allow-scripts allow-same-origin allow-popups"
          onLoad={handleGlassLoad}
          onError={() => onFail()}
        />
      ) : (
        <GlassPlaceholder height={embed.aspectRatio ? undefined : fallbackHeight} />
      )}
      {/* Cover Bandcamp logo — top-left corner */}
      {embed.platform === 'bandcamp' && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: 120, height: 28, background: '#000', zIndex: 2, pointerEvents: 'auto' }} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// SMART LINK FALLBACK — ArtifactTile or ReaderTile with OG enrichment
// ════════════════════════════════════════════════════════════

function SmartLinkFallback({
  url,
  title,
  description,
  thumbnail,
  thumbnailOverride,
  artist,
  isInView,
  aspectClass,
  isPublicView,
}: {
  url: string
  title: string | null
  description: string | null
  thumbnail: string | null
  thumbnailOverride: string | null
  artist: string | null | undefined
  isInView: boolean
  aspectClass: string
  isPublicView: boolean
}) {
  const [ogMeta, setOgMeta] = useState<{
    title?: string | null
    description?: string | null
    image?: string | null
  } | null>(null)
  const fetched = useRef(false)

  useEffect(() => {
    if (!isInView || fetched.current) return
    fetched.current = true
    const controller = new AbortController()
    fetch(`/api/og-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => setOgMeta(data))
      .catch(() => {})
    return () => controller.abort()
  }, [isInView, url])

  const linkObj = normalizeLinkObject(url, {
    title: title || ogMeta?.title,
    description: description || ogMeta?.description,
    image: thumbnailOverride || thumbnail || ogMeta?.image,
    creator: artist || null,
  })

  if (linkObj.renderKind === 'reader') {
    return (
      <ReaderTile
        title={linkObj.title}
        publication={linkObj.provider}
        author={linkObj.creator}
        image={linkObj.image}
        description={linkObj.description}
        actionUrl={linkObj.actionUrl}
        aspectClass={aspectClass}
      />
    )
  }

  return (
    <ArtifactTile
      title={linkObj.title}
      provider={linkObj.provider}
      image={linkObj.image}
      description={linkObj.description}
      actionUrl={linkObj.actionUrl}
      aspectClass={aspectClass}
      isPublicView={isPublicView}
    />
  )
}
