'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import type { ContentType } from '@/lib/parser'
import { detectVariant } from '@/lib/parser'
import { audioManager } from '@/lib/audio-manager'
import { parseEmbed, extractYouTubeId, extractYouTubeStart, buildYouTubeEmbedUrl } from '@/lib/parseEmbed'
import type { EmbedResult } from '@/lib/parseEmbed'
import GlassEmbedFrameExtracted, { GLASS_STYLE as GLASS_STYLE_IMPORTED, GlassPlaceholder as GlassPlaceholderExtracted } from '@/components/GlassEmbedFrame'
import FieldBackground from '@/components/FieldBackground'
import { transformImageUrl } from '@/lib/image'
import { applyNextThumbnailFallback, applyThumbnailLoadGuard, getBestThumbnailUrl, getYouTubeThumbnailCandidates } from '@/lib/media/thumbnails'
import ArtifactShell from '@/components/ArtifactShell'
import SocialEmbed from '@/components/SocialEmbed'
import TextExpandTile from '@/components/TextExpandTile'
import FallbackCard from '@/components/FallbackCard'
import ArtifactTile from '@/components/ArtifactTile'
import TwitterTile from '@/components/TwitterTile'
import MusicEmbedTile from '@/components/MusicEmbedTile'
import ReaderTile from '@/components/ReaderTile'
import { sanitizeLinkMeta, normalizeLinkObject } from '@/lib/link-object'
import { tryNativeFullscreen } from '@/lib/fullscreen'
import TheaterOverlay from '@/components/TheaterOverlay'
import {
  isYouTubePlayingMessage,
  nudgeYouTubeQuality,
  shouldMountYouTubePlayer,
  shouldRevealYouTubePlayer,
  startYouTubePlayback,
} from '@/lib/youtube-player'

// ════════════════════════════════════════
// Glass Embed Frame — imported from extracted component
// ════════════════════════════════════════

const GLASS_STYLE = GLASS_STYLE_IMPORTED
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
  }
  onWidescreen?: () => void
  isMobile?: boolean
  tileSize?: number
  aspect?: string
  isPublicView?: boolean
  /** When true, show full embed immediately (no facade). Used in lightbox. */
  isExpanded?: boolean
}

/**
 * Content Card — Universal Embed Engine
 *
 * Zero-error contract: every URL renders something intentional.
 * parseEmbed → iframe tile (with silent fallback to link card)
 * null → link card (OG metadata via /api/og-preview)
 * Everything fails gracefully. No broken states.
 */
export default function ContentCard({ content, onWidescreen, isMobile = false, tileSize = 1, aspect = 'square', isPublicView = false, isExpanded = false }: ContentCardProps) {
  // 3-state topology: M (size 2) forces 4:3 landscape regardless of stored aspect
  const effectiveAspect = tileSize === 2 ? 'wide' : aspect
  const aspectClass = effectiveAspect === 'wide' ? 'aspect-video' : effectiveAspect === 'tall' ? 'aspect-[9/16]' : effectiveAspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-square'
  const fitClass = 'object-cover'
  const [isActivated, setIsActivated] = useState(false)
  const [youtubeHasStarted, setYoutubeHasStarted] = useState(false)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [shellOpen, setShellOpen] = useState(false)
  // Spec: AE Presentation Layer — Task 3. Thumb 404 → FallbackCard, not gray box.
  const [socialThumbFailed, setSocialThumbFailed] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoError, setIsVideoError] = useState(false)
  const [isVideoMuted, setIsVideoMuted] = useState(true)
  // Decoder cap: only autoplay when ≥50% visible. See videoRef effect below.
  const [isVideoPlayable, setIsVideoPlayable] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null)
  const audioIdRef = useRef(`card-${content.id}`)
  // Fullscreen affordance for the YouTube embed branch: mirrors GhostTile
  // so cross-origin-iframe-fullscreen failures (iOS Safari) drop into the
  // Footprint Theater overlay instead of producing a dead tap.
  const [theaterOpen, setTheaterOpen] = useState(false)
  // Pause the underlying YouTube iframe while theater is open so audio
  // doesn't double up. Same pattern as GhostTile.
  useEffect(() => {
    if (!theaterOpen) return
    const tileIframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
    try {
      tileIframe?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
        '*'
      )
    } catch {}
  }, [theaterOpen])

  // FIDELIO: Detect post vs profile for social embeds
  const socialVariant = detectVariant(content.type, content.url)
  const hasSocialEmbed = ['twitter', 'tiktok', 'instagram'].includes(content.type)

  // IntersectionObserver — only load content when near viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true) },
      { rootMargin: '200px' }
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
    if (isVideoPlayable) v.play().catch(() => {})
    else v.pause()
  }, [isVideoPlayable])

  // Register audio-producing types with AudioManager
  useEffect(() => {
    const isAudioType = ['youtube', 'soundcloud', 'spotify'].includes(content.type)
    if (!isAudioType) return
    audioManager.register(audioIdRef.current, () => {
      setIsActivated(false)
    })
    return () => audioManager.unregister(audioIdRef.current)
  }, [content.type, content.id])

  const handleActivate = () => {
    if (['youtube', 'soundcloud', 'spotify'].includes(content.type)) {
      audioManager.play(audioIdRef.current)
    }
    setIsActivated(true)
    if (content.type === 'youtube') {
      setYoutubeHasStarted(false)
      startYouTubePlayback(youtubeIframeRef.current)
    }
  }

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
      if (isYouTubePlayingMessage(data)) setYoutubeHasStarted(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [content.type, isActivated])

  // ════════════════════════════════════════
  // YOUTUBE — FACADE: thumbnail first, iframe on tap
  // Surface-ownership law: YouTube iframe ONLY mounts after explicit user tap.
  // No isExpanded shortcut. No hover preview. No delayed activation.
  // ════════════════════════════════════════
  // Detect YouTube by URL, not just stored type — catches mistyped tiles
  const youtubeId = extractYouTubeId(content.url)
  const youtubeThumbCandidates = youtubeId
    ? getYouTubeThumbnailCandidates({
        url: content.url,
        media_id: youtubeId,
        thumbnail_url: content.thumbnail_url,
        thumbnail_url_hq: content.thumbnail_url_hq,
      })
    : []
  if (youtubeId && !iframeFailed) {
    // The autoplay= URL param can be dropped when the iframe loads
    // asynchronously after the user's tap (gesture context expires before
    // the YouTube player initializes). Force playback via the JS API so
    // the user's first tap is the only one needed — no native YouTube
    // play button intermediate step. Unmute settles ~800ms later.
    const handleYTLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
      const iframe = e.currentTarget
      const post = (msg: Record<string, any>) => {
        try { iframe.contentWindow?.postMessage(JSON.stringify(msg), '*') } catch {}
      }
      if (isActivated) {
        post({ event: 'command', func: 'playVideo', args: '' })
        setTimeout(() => post({ event: 'command', func: 'playVideo', args: '' }), 250)
        setTimeout(() => post({ event: 'command', func: 'playVideo', args: '' }), 700)
        setTimeout(() => post({ event: 'command', func: 'playVideo', args: '' }), 1200)
      }
      setTimeout(() => {
        post({ event: 'command', func: 'unMute', args: '' })
        post({ event: 'command', func: 'setVolume', args: [100] })
      }, 800)
    }

    const shouldMountPlayer = shouldMountYouTubePlayer('youtube', isActivated, isCoarsePointer, isInView)

    if (!shouldMountPlayer) {
      return (
        <div
          ref={containerRef}
          className="w-full h-full fp-tile overflow-hidden cursor-pointer relative group bg-black"
          onClick={handleActivate}
        >
          <div className="fp-resting-video-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={youtubeThumbCandidates[0]}
              alt=""
              className="fp-resting-video-media"
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={(e) => applyThumbnailLoadGuard(e.currentTarget, youtubeThumbCandidates)}
              onError={(e) => applyNextThumbnailFallback(e.currentTarget, youtubeThumbCandidates)}
            />
          </div>
        </div>
      )
    }

    // Mobile prewarms this iframe behind the poster so the first tap can
    // address an already-ready player while the gesture is still live.
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
        style={{ background: '#000' }}
      >
        <FieldBackground imageUrl={youtubeThumbCandidates[0]} intensity="embed" />
        <iframe
          ref={youtubeIframeRef}
          src={ytActivatedSrc}
          width={1920}
          height={1080}
          className="w-full max-w-full h-full relative"
          style={{
            border: 'none',
            zIndex: 1,
            opacity: shouldRevealYouTubePlayer(isActivated, youtubeHasStarted) ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleYTLoad}
        />
        {!shouldRevealYouTubePlayer(isActivated, youtubeHasStarted) && (
          <button
            type="button"
            aria-label="Play video"
            onPointerDown={!isActivated ? handleActivate : undefined}
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
                className="fp-resting-video-media"
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={(e) => applyThumbnailLoadGuard(e.currentTarget, youtubeThumbCandidates)}
                onError={(e) => applyNextThumbnailFallback(e.currentTarget, youtubeThumbCandidates)}
              />
            </div>
          </button>
        )}
        {/* Mobile (coarse pointer): tap anywhere on the tile opens focus
            mode. Provider iframes can't be trusted to native-fullscreen on
            iOS, so we don't try — focus mode is the affordance. */}
        <button
          type="button"
          aria-label="Open focus mode"
          onClick={(e) => { e.stopPropagation(); setTheaterOpen(true) }}
          className="absolute inset-0 hidden [@media(pointer:coarse)]:block"
          style={{
            zIndex: 3,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        />
        {/* Desktop (fine pointer): hover chip → native fullscreen. */}
        <button
          type="button"
          aria-label="Fullscreen"
          onClick={(e) => {
            e.stopPropagation()
            const btn = e.currentTarget as HTMLElement
            const container = (btn.closest('[data-tile]') as HTMLElement) || containerRef.current
            const iframe = container?.querySelector('iframe') as HTMLIFrameElement | null
            nudgeYouTubeQuality(iframe)
            tryNativeFullscreen(iframe).then((ok) => {
              if (ok) return
              tryNativeFullscreen(container).then((ok2) => {
                if (!ok2) setTheaterOpen(true)
              })
            })
          }}
          className="absolute items-center justify-center text-white/85 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-300 hidden [@media(pointer:fine)]:flex"
          style={{
            bottom: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 999,
            zIndex: 4,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(10px) saturate(140%)',
            WebkitBackdropFilter: 'blur(10px) saturate(140%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            pointerEvents: 'auto',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>
          </svg>
        </button>
        {theaterOpen && (
          <TheaterOverlay src={ytActivatedSrc} onClose={() => setTheaterOpen(false)} />
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
        displayMode={isWideMusic ? 'player' : 'cover'}
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
          className={`w-full max-w-full ${aspectClass || 'aspect-square'} fp-tile overflow-hidden cursor-pointer relative group bg-black`}
          onClick={handleActivate}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-3 h-3 text-white/80 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <p className="text-white/50 text-[10px] font-medium line-clamp-2 max-w-[80%] text-center" style={{ lineHeight: 1.35 }}>{content.title || ''}</p>
          </div>
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
          className={`w-full max-w-full ${aspectClass} fp-tile overflow-hidden bg-black [&_iframe]:!w-full [&_iframe]:!max-w-full [&_iframe]:!h-full`}
          style={{ position: 'relative' }}
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
        <div ref={containerRef} className={`w-full max-w-full ${aspectClass || 'aspect-video'} fp-tile overflow-hidden relative bg-black`}>
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
              autoPlay={isVideoPlayable}
              loop
              playsInline
              preload="metadata"
              poster={content.thumbnail_url || undefined}
              className={`block w-full ${aspectClass || 'aspect-video'} ${fitClass} cursor-pointer`}
              onLoadedData={() => setIsLoaded(true)}
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
              onError={() => setIsVideoError(true)}
              onClick={(e) => {
                const v = e.currentTarget as HTMLVideoElement
                setIsVideoMuted(!v.muted)
                v.muted = !v.muted
              }}
              onMouseEnter={(e) => {
                const v = e.currentTarget as HTMLVideoElement
                if (v.paused) v.play().catch(() => {})
              }}
            />
            {/* Mute state dot — lower right */}
            <div
              className="absolute bottom-2.5 right-2.5 pointer-events-none transition-opacity duration-300"
              style={{ opacity: isVideoMuted ? 0.35 : 0.9 }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: isVideoMuted ? 'rgba(255,255,255,0.6)' : '#fff' }}
              />
            </div>
          </>
        ) : (
          <div className={`w-full ${aspectClass || 'aspect-video'}`} style={{ background: 'rgba(0,0,0,0.3)' }} />
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
          <Image
            src={transformImageUrl(content.url)}
            alt={content.title || ''}
            width={600}
            height={800}
            sizes="(max-width: 768px) 50vw, 25vw"
            className="w-full h-full object-cover"
            loading="eager"
            quality={90}
            onLoad={(e) => {
              setIsLoaded(true)
              const img = e.currentTarget as HTMLImageElement
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
  // TWITTER / X — glass tile, click-to-expand XEmbed
  // Matched by URL, not stored type — seals pic.twitter.com and mistyped tiles.
  // Compact resting state; ArtifactShell + SocialEmbed on tap.
  // ════════════════════════════════════════
  if (/(?:twitter\.com|x\.com)/i.test(content.url)) {
    const { title, creator, image } = sanitizeLinkMeta(
      { title: content.title, creator: content.artist, image: getBestThumbnailUrl(content), description: content.description },
      content.url
    )
    const isPost = /\/status\/\d+/.test(content.url)
    const handleMatch = content.url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/)
    const handle = creator || (handleMatch ? `@${handleMatch[1]}` : null)
    return (
      <TwitterTile
        title={title}
        authorHandle={handle}
        image={image}
        url={content.url}
        aspectClass={aspectClass}
        variant={isPost ? 'post' : 'profile'}
      />
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
          onClick={() => canPlayInline ? setIsActivated(true) : setShellOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') (canPlayInline ? setIsActivated(true) : setShellOpen(true)) }}
          ref={containerRef as any}
          className={`block w-full h-full fp-tile overflow-hidden relative cursor-pointer ${aspectClass}`}
          style={hasVisualBg ? { background: 'transparent' } : {
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px) saturate(120%)',
            WebkitBackdropFilter: 'blur(20px) saturate(120%)',
          }}
        >
          {thumbSrc && (
            <div className="fp-resting-video-frame z-[1]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc}
                alt=""
                className="fp-resting-video-media"
                loading="eager"
                decoding="async"
                onError={() => setSocialThumbFailed(true)}
              />
            </div>
          )}
          {/* Text overlay — caption atop thumb, readable via text-shadow */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 gap-3">
            <p
              className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow ${typo} line-clamp-6`}
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
          <ArtifactShell onDismiss={() => setShellOpen(false)} fallbackUrl={content.url}>
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
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          {thumbSrc && (
            <div className="fp-resting-video-frame z-[1]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc}
                alt=""
                className="fp-resting-video-media"
                loading="eager"
                decoding="async"
                onError={() => setSocialThumbFailed(true)}
              />
            </div>
          )}
          {/* Text overlay — caption atop thumb */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5">
            <p
              className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow ${typo} line-clamp-6`}
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
      artist={content.artist}
      isInView={isInView}
      aspectClass={aspectClass}
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
  artist,
  isInView,
  aspectClass,
}: {
  url: string
  title: string | null
  description: string | null
  thumbnail: string | null
  artist: string | null | undefined
  isInView: boolean
  aspectClass: string
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
    image: thumbnail || ogMeta?.image,
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
    />
  )
}
