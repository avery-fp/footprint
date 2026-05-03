'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import type { ContentType } from '@/lib/parser'
import { detectVariant } from '@/lib/parser'
import { audioManager } from '@/lib/audio-manager'
import { parseEmbed, extractYouTubeId, buildYouTubeEmbedUrl } from '@/lib/parseEmbed'
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
import MusicTile from '@/components/MusicTile'
import ReaderTile from '@/components/ReaderTile'
import { sanitizeLinkMeta, normalizeLinkObject } from '@/lib/link-object'

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
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [shellOpen, setShellOpen] = useState(false)
  // Spec: AE Presentation Layer — Task 3. Thumb 404 → FallbackCard, not gray box.
  const [socialThumbFailed, setSocialThumbFailed] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoError, setIsVideoError] = useState(false)
  const [isVideoMuted, setIsVideoMuted] = useState(true)
  // YouTube: keep facade thumbnail covering iframe until playback actually starts,
  // so users don't stare at YouTube's own title/logo/play-button chrome during load.
  const [ytPlaying, setYtPlaying] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioIdRef = useRef(`card-${content.id}`)

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
  }

  // ════════════════════════════════════════
  // YOUTUBE — FACADE: thumbnail first, iframe on tap
  // Surface-ownership law: YouTube iframe ONLY mounts after explicit user tap.
  // No isExpanded shortcut. No hover preview. No delayed activation.
  // ════════════════════════════════════════
  // Detect YouTube by URL, not just stored type — catches mistyped tiles
  const youtubeId = extractYouTubeId(content.url)

  // Reset playing flag whenever the user re-activates (or AudioManager deactivates)
  useEffect(() => {
    if (!isActivated) setYtPlaying(false)
  }, [isActivated])

  // Listen for YouTube IFrame API state changes. Drop the facade only when the
  // player reports PLAYING (1) — anything earlier is YouTube's own chrome.
  useEffect(() => {
    if (!isActivated || !youtubeId) return
    const onMsg = (e: MessageEvent) => {
      const origin = e.origin || ''
      if (!origin.includes('youtube.com') && !origin.includes('youtube-nocookie.com')) return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        const state =
          data?.event === 'onStateChange' ? data?.info :
          data?.event === 'infoDelivery' ? data?.info?.playerState :
          undefined
        if (state === 1) setYtPlaying(true)
      } catch {}
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [isActivated, youtubeId])

  const youtubeThumbCandidates = youtubeId
    ? getYouTubeThumbnailCandidates({
        url: content.url,
        media_id: youtubeId,
        thumbnail_url: content.thumbnail_url,
        thumbnail_url_hq: content.thumbnail_url_hq,
      })
    : []
  if (youtubeId && !iframeFailed) {
    // postMessage unmute — mobile Safari enforces mute on iframe autoplay
    // even after user gesture. enablejsapi=1 + postMessage bypasses this.
    // Also subscribe to onStateChange so we can hide the facade overlay the
    // instant playback begins (state === 1), instead of revealing YouTube's
    // own title/play-button chrome during the iframe load window.
    const handleYTLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
      const iframe = e.currentTarget
      try {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'listening', id: youtubeId }),
          '*',
        )
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }),
          '*',
        )
      } catch {}
      setTimeout(() => {
        try {
          iframe.contentWindow?.postMessage('{"event":"command","func":"unMute","args":""}', '*')
          iframe.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*')
        } catch {}
      }, 800)
    }

    // Facade — always shown first. isExpanded has no effect on YouTube:
    // the wall is Footprint-owned and the iframe only mounts on explicit tap.
    if (!isActivated) {
      const thumbSrc = youtubeThumbCandidates[0]
      return (
        <div
          ref={containerRef}
          className="w-full h-full fp-tile overflow-hidden cursor-pointer relative group bg-black"
          onClick={handleActivate}
        >
          <div className="fp-resting-video-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbSrc}
              alt=""
              className="fp-resting-video-media"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                applyThumbnailLoadGuard(e.currentTarget, youtubeThumbCandidates)
              }}
              onError={(e) => {
                applyNextThumbnailFallback(e.currentTarget, youtubeThumbCandidates)
              }}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
      )
    }
    // YouTube activated state — mute=1 for reliable autoplay, postMessage unmutes after load
    const ytActivatedSrc = buildYouTubeEmbedUrl(youtubeId)
    const ytFacadeThumb = youtubeThumbCandidates[0]
    return (
      <div ref={containerRef} className="w-full h-full fp-tile overflow-hidden relative" style={{ background: '#000' }}>
        <FieldBackground imageUrl={ytFacadeThumb} intensity="embed" />
        <iframe
          src={ytActivatedSrc}
          className="w-full h-full relative"
          style={{ border: 'none', zIndex: 1 }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleYTLoad}
        />
        {/* Cover YouTube's pre-play chrome (title, channel, logo, play button)
            with the facade thumbnail until the player reports playing. */}
        {ytFacadeThumb && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              zIndex: 2,
              opacity: ytPlaying ? 0 : 1,
              transition: 'opacity 180ms ease-out',
              background: '#000',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ytFacadeThumb}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════
  // SPOTIFY — MusicTile. Artwork + title + artist. Tap opens Spotify.
  // ════════════════════════════════════════
  if (content.type === 'spotify') {
    const thumbSrc = getBestThumbnailUrl(content)
    const { title, creator } = sanitizeLinkMeta(
      { title: content.title, creator: content.artist },
      content.url
    )
    return (
      <MusicTile
        title={title}
        creator={creator}
        image={thumbSrc}
        provider="Spotify"
        actionUrl={content.url}
        aspectClass={aspectClass}
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
          className={`w-full ${aspectClass || 'aspect-square'} fp-tile overflow-hidden cursor-pointer relative group bg-black`}
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
          className="w-full fp-tile overflow-hidden"
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
          className={`w-full ${aspectClass} fp-tile overflow-hidden bg-black [&_iframe]:!h-full`}
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
        <div ref={containerRef} className={`w-full ${aspectClass || 'aspect-video'} fp-tile overflow-hidden relative`}>
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
        <div ref={containerRef} className={`w-full ${aspectClass || 'aspect-video'} fp-tile overflow-hidden relative bg-black`}>
          {isInView ? (
            <div
              className="absolute inset-0 [&_iframe]:!w-full [&_iframe]:!h-full"
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
              src={videoSrc}
              muted={isVideoMuted}
              autoPlay
              loop
              playsInline
              preload="auto"
              poster={content.thumbnail_url || undefined}
              className={`w-full ${aspectClass || 'aspect-video'} ${fitClass} cursor-pointer`}
              onLoadedData={(e) => { setIsLoaded(true); (e.target as HTMLVideoElement).play().catch(() => {}) }}
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
            loading="lazy"
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
  // TWITTER / X — ArtifactTile fallback
  // Matched by URL, not stored type — seals pic.twitter.com and mistyped tiles.
  // Clean object. Tweet text as title. "X" as provider. No embed.
  // ════════════════════════════════════════
  if (/(?:twitter\.com|x\.com)/i.test(content.url)) {
    const { title, creator, image, description, provider } = sanitizeLinkMeta(
      { title: content.title, creator: content.artist, image: getBestThumbnailUrl(content), description: content.description },
      content.url
    )
    return (
      <ArtifactTile
        title={title}
        provider={provider}
        image={image}
        description={description}
        actionUrl={content.url}
        aspectClass={aspectClass}
      />
    )
  }

  // ════════════════════════════════════════
  // TIKTOK — first-party closed state, ArtifactShell on tap
  // FIDELIO: No third-party scripts until shell opens
  // ════════════════════════════════════════
  if (content.type === 'tiktok') {
    const thumbSrc = getBestThumbnailUrl(content)

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
                loading="lazy"
                decoding="async"
                onError={() => setSocialThumbFailed(true)}
              />
            </div>
          )}
          {/* Text overlay — caption atop thumb, readable via text-shadow */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5">
            <p
              className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow ${typo} line-clamp-6`}
              style={{ fontWeight: 500 }}
            >
              {tiktokText}
            </p>
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
                loading="lazy"
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
  // APPLE MUSIC — MusicTile. No native embed; opens Apple Music.
  // ════════════════════════════════════════
  if (content.url.includes('music.apple.com') || content.type === 'apple_music') {
    const thumbSrc = getBestThumbnailUrl(content)
    const { title, creator } = sanitizeLinkMeta(
      { title: content.title, creator: content.artist },
      content.url
    )
    return (
      <MusicTile
        title={title}
        creator={creator}
        image={thumbSrc}
        provider="Apple Music"
        actionUrl={content.url}
        aspectClass={aspectClass}
      />
    )
  }

  // ════════════════════════════════════════
  // UNIVERSAL EMBED ENGINE — Tier 2 platforms
  // Bandcamp, Google Maps, CodePen, Are.na, Figma
  // Try iframe with 3s timeout → fallback to SmartLinkFallback
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
