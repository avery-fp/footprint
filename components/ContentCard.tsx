'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import type { ContentType } from '@/lib/parser'
import { audioManager } from '@/lib/audio-manager'
import { parseEmbed, extractYouTubeId } from '@/lib/parseEmbed'
import type { EmbedResult } from '@/lib/parseEmbed'
import GlassEmbedFrameExtracted, { GLASS_STYLE as GLASS_STYLE_IMPORTED, GlassPlaceholder as GlassPlaceholderExtracted } from '@/components/GlassEmbedFrame'
import FieldBackground from '@/components/FieldBackground'
import { transformImageUrl } from '@/lib/image'
import { applyNextThumbnailFallback, applyThumbnailLoadGuard, getBestThumbnailUrl, getYouTubeThumbnailCandidates } from '@/lib/media/thumbnails'

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
  const aspectClass = aspect === 'wide' ? 'aspect-video' : aspect === 'tall' ? 'aspect-[9/16]' : aspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-square'
  const fitClass = 'object-cover'
  const [isActivated, setIsActivated] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioIdRef = useRef(`card-${content.id}`)

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

  let hostname = 'Link'
  try {
    hostname = new URL(content.url).hostname.replace('www.', '')
  } catch {}

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
    // postMessage unmute — mobile Safari enforces mute on iframe autoplay
    // even after user gesture. enablejsapi=1 + postMessage bypasses this.
    const handleYTLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
      const iframe = e.currentTarget
      setTimeout(() => {
        try {
          iframe.contentWindow?.postMessage('{"event":"command","func":"unMute","args":""}', '*')
          iframe.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*')
        } catch {}
      }, 800)
    }

    // isExpanded: skip facade, render iframe immediately (used in lightbox)
    if (isExpanded) {
      const thumbSrc = youtubeThumbCandidates[0]
      const ytSrc = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&enablejsapi=1&rel=0&iv_load_policy=3&playsinline=1`
      return (
        <div ref={containerRef} className="w-full h-full fp-tile overflow-hidden relative" style={{ background: '#000' }}>
          <FieldBackground imageUrl={thumbSrc} intensity="embed" />
          <iframe
            src={ytSrc}
            className="w-full h-full relative"
            style={{ border: 'none', zIndex: 1 }}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={handleYTLoad}
          />
        </div>
      )
    }
    // Facade — always shows a thumbnail, never collapses
    if (!isActivated) {
      const thumbSrc = youtubeThumbCandidates[0]
      return (
        <div
          ref={containerRef}
          className="w-full h-full fp-tile overflow-hidden cursor-pointer relative group bg-black"
          onClick={handleActivate}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbSrc}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              applyThumbnailLoadGuard(e.currentTarget, youtubeThumbCandidates)
            }}
            onError={(e) => {
              applyNextThumbnailFallback(e.currentTarget, youtubeThumbCandidates)
            }}
          />
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
    const ytActivatedSrc = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&enablejsapi=1&rel=0&iv_load_policy=3&playsinline=1`
    return (
      <div ref={containerRef} className="w-full h-full fp-tile overflow-hidden relative" style={{ background: '#000' }}>
        <FieldBackground imageUrl={youtubeThumbCandidates[0]} intensity="embed" />
        <iframe
          src={ytActivatedSrc}
          className="w-full h-full relative"
          style={{ border: 'none', zIndex: 1 }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleYTLoad}
        />
      </div>
    )
  }

  // ════════════════════════════════════════
  // SPOTIFY — share card. No iframe. No embed.
  // Album art full bleed + title/artist overlay. Tap opens Spotify.
  // ════════════════════════════════════════
  if (content.type === 'spotify') {
    const thumbSrc = getBestThumbnailUrl(content)

    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full relative overflow-hidden"
        style={{ borderRadius: 'inherit' }}
      >
        {/* Album art — full bleed */}
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}

        {/* Bottom gradient — text readability */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{ height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
        />

        {/* Title + artist */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 flex flex-col items-center gap-0.5">
          {content.title && (
            <span
              className="text-white/80 line-clamp-2 text-center fp-text-shadow"
              style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.35 }}
            >
              {content.title}
            </span>
          )}
          {content.artist && (
            <span
              className="text-white/40 uppercase tracking-widest truncate max-w-full text-center font-mono"
              style={{ fontSize: '9px', fontWeight: 500, lineHeight: 1.2 }}
            >
              {content.artist}
            </span>
          )}
        </div>
      </a>
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
    return (
      <div ref={containerRef} className="fp-tile overflow-hidden relative">
        {isInView ? (
          <video
            src={content.url}
            muted
            loop
            playsInline
            preload="metadata"
            className={`w-full ${aspectClass || 'aspect-video'} ${fitClass}`}
            onLoadedData={(e) => { setIsLoaded(true); (e.target as HTMLVideoElement).play().catch(() => {}) }}
          />
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
  // THOUGHT — text tile with glass background
  // ════════════════════════════════════════
  if (content.type === 'thought') {
    const text = content.title || content.description || ''
    const len = text.length
    const typo = len <= 6
      ? 'text-[28px] font-light tracking-[-0.035em] leading-none'
      : len <= 20
      ? 'text-[18px] font-light tracking-[-0.025em] leading-tight'
      : len <= 60
      ? 'text-[15px] font-light tracking-[-0.01em] leading-snug'
      : 'text-[15px] font-light tracking-[-0.01em] leading-relaxed'

    if (isPublicView) {
      return (
        <div
          className="w-full h-full flex items-center justify-center p-5"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px) saturate(120%)',
            WebkitBackdropFilter: 'blur(20px) saturate(120%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            minHeight: '200px',
          }}
        >
          <p className={`whitespace-pre-wrap text-center text-white ${typo}`} style={{ fontWeight: 300, lineHeight: 1.5 }}>
            {text}
          </p>
        </div>
      )
    }

    return (
      <div className="w-full h-full fp-tile fp-surface flex items-center justify-center p-5">
        <p className={`whitespace-pre-wrap text-center opacity-85 ${typo}`}>
          {text}
        </p>
      </div>
    )
  }

  // ════════════════════════════════════════
  // TWITTER / X — thumbnail first, text fallback
  // ════════════════════════════════════════
  if (content.type === 'twitter') {
    const thumbSrc = getBestThumbnailUrl(content)
    const tweetMatch = content.url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\//)
    const handle = tweetMatch?.[1] ? `@${tweetMatch[1]}` : null

    // If we have a thumbnail, render full-bleed — hide on error so text fallback shows
    if (thumbSrc) {
      return (
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          ref={containerRef as any}
          className={`block w-full h-full fp-tile overflow-hidden relative ${aspectClass}`}
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbSrc}
            alt=""
            className="w-full h-full object-cover absolute inset-0 z-[1]"
            loading="lazy"
            decoding="async"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          {/* Text fallback — visible when thumbnail fails */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5">
            <span className="absolute top-2.5 right-3 text-[13px] text-white/20 select-none" style={{ fontWeight: 300 }}>𝕏</span>
            <p className="whitespace-pre-wrap text-center text-white/80 fp-text-shadow text-[14px] leading-snug line-clamp-6" style={{ fontWeight: 500 }}>
              {content.title || (handle ? `Tweet by ${handle}` : 'Tweet')}
            </p>
          </div>
        </a>
      )
    }

    // Text-only tweet — DM Sans, weight hierarchy, text-shadow
    const tweetText = content.title || (handle ? `Tweet by ${handle}` : 'Tweet')
    const isFallback = !content.title || content.title.startsWith('Tweet by ')
    const len = tweetText.length
    const typo = len <= 60
      ? 'text-[14px] tracking-[-0.01em] leading-snug'
      : len <= 140
      ? 'text-[12px] tracking-[-0.005em] leading-relaxed'
      : 'text-[11px] tracking-normal leading-relaxed'

    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full h-full fp-tile overflow-hidden relative flex flex-col items-center justify-center p-5 ${aspectClass}`}
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <span className="absolute top-2.5 right-3 text-[13px] text-white/20 select-none" style={{ fontWeight: 300 }}>𝕏</span>
        <p
          className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow ${typo} line-clamp-6`}
          style={{ fontWeight: 500 }}
        >
          {tweetText}
        </p>
        {handle && !isFallback && (
          <span className="mt-2.5 text-[9px] text-white/40 uppercase tracking-[0.08em] font-mono" style={{ fontWeight: 500 }}>{handle}</span>
        )}
      </a>
    )
  }

  // ════════════════════════════════════════
  // TIKTOK — thumbnail with text fallback on failure
  // ════════════════════════════════════════
  if (content.type === 'tiktok') {
    const thumbSrc = getBestThumbnailUrl(content)
    const tiktokText = content.title || 'TikTok'
    const len = tiktokText.length
    const typo = len <= 60
      ? 'text-[14px] tracking-[-0.01em] leading-snug'
      : len <= 140
      ? 'text-[12px] tracking-[-0.005em] leading-relaxed'
      : 'text-[11px] tracking-normal leading-relaxed'

    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        ref={containerRef as any}
        className={`block w-full h-full fp-tile overflow-hidden relative ${aspectClass}`}
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        {thumbSrc && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbSrc}
            alt=""
            className="w-full h-full object-cover absolute inset-0 z-[1]"
            loading="lazy"
            decoding="async"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {/* Text fallback — visible when no thumbnail or image fails */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-5">
          <p
            className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow ${typo} line-clamp-6`}
            style={{ fontWeight: 500 }}
          >
            {tiktokText}
          </p>
        </div>
      </a>
    )
  }

  // ════════════════════════════════════════
  // INSTAGRAM — thumbnail with text fallback on failure
  // ════════════════════════════════════════
  if (content.type === 'instagram') {
    const thumbSrc = getBestThumbnailUrl(content)
    const igText = content.title || 'Instagram'
    const len = igText.length
    const typo = len <= 60
      ? 'text-[14px] tracking-[-0.01em] leading-snug'
      : len <= 140
      ? 'text-[12px] tracking-[-0.005em] leading-relaxed'
      : 'text-[11px] tracking-normal leading-relaxed'

    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        ref={containerRef as any}
        className={`block w-full h-full fp-tile overflow-hidden relative ${aspectClass}`}
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        {thumbSrc && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbSrc}
            alt=""
            className="w-full h-full object-cover absolute inset-0 z-[1]"
            loading="lazy"
            decoding="async"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {/* Text fallback — visible when no thumbnail or image fails */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-5">
          <p
            className={`whitespace-pre-wrap text-center text-white/80 fp-text-shadow ${typo} line-clamp-6`}
            style={{ fontWeight: 500 }}
          >
            {igText}
          </p>
        </div>
      </a>
    )
  }

  // ════════════════════════════════════════
  // UNIVERSAL EMBED ENGINE — Tier 2 platforms
  // Bandcamp, Google Maps, CodePen, Are.na, Figma
  // Try iframe with 3s timeout → fallback to link card
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
  // LINK CARD — clean fallback for everything else
  // ════════════════════════════════════════
  const fallbackThumbSrc = getBestThumbnailUrl(content)
  if (fallbackThumbSrc) {
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        ref={containerRef as any}
        className={`block w-full ${aspectClass} fp-tile overflow-hidden relative`}
      >
        <Image
          src={transformImageUrl(fallbackThumbSrc)}
          alt={content.title || ''}
          fill
          sizes={tileSize >= 2 ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 50vw, 25vw'}
          className="object-cover"
          loading="lazy"
          quality={90}
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsLoaded(true)}
        />
      </a>
    )
  }

  return (
    <LinkCard
      url={content.url}
      title={content.title}
      hostname={hostname}
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
// LINK CARD — frosted glass with OG metadata
// ════════════════════════════════════════════════════════════

function LinkCard({
  url,
  title: initialTitle,
  hostname,
  isInView,
  aspectClass,
}: {
  url: string
  title: string | null
  hostname: string
  isInView: boolean
  aspectClass: string
}) {
  const [meta, setMeta] = useState<{
    title?: string | null
    image?: string | null
  } | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const fetched = useRef(false)

  // Fetch OG metadata when tile comes into view
  useEffect(() => {
    if (!isInView || fetched.current) return
    fetched.current = true

    const controller = new AbortController()
    fetch(`/api/og-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => setMeta(data))
      .catch(() => {}) // Silent — we already have hostname fallback
    return () => controller.abort()
  }, [isInView, url])

  const displayTitle = meta?.title || initialTitle || hostname
  const ogImage = meta?.image

  // If we got an OG image, show it as visual tile
  if (ogImage && imageLoaded) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full ${aspectClass} fp-tile overflow-hidden relative`}
        style={{ background: 'rgba(0,0,0,0.3)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ogImage}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </a>
    )
  }

  // Preload OG image in background
  if (ogImage && !imageLoaded) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full ${aspectClass} fp-tile overflow-hidden relative`}
        style={{
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        {/* Hidden preloader */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ogImage}
          alt=""
          className="absolute opacity-0"
          onLoad={() => setImageLoaded(true)}
          onError={() => setMeta(m => m ? { ...m, image: null } : m)}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
          <span
            className="text-[11px] tracking-wider text-white/60 text-center line-clamp-2"
            style={{ fontWeight: 500, lineHeight: 1.35 }}
          >
            {displayTitle !== hostname ? displayTitle : ''}
          </span>
        </div>
      </a>
    )
  }

  // Text-only link card — frosted glass, title only
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full ${aspectClass} fp-tile overflow-hidden flex flex-col items-center justify-center gap-2 p-4`}
      style={{
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <span
        className="text-[11px] tracking-wider text-white/60 text-center line-clamp-2"
        style={{ fontWeight: 500, lineHeight: 1.35 }}
      >
        {displayTitle !== hostname ? displayTitle : ''}
      </span>
    </a>
  )
}
