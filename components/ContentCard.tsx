'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { getContentIcon, getContentBackground, ContentType } from '@/lib/parser'
import { audioManager } from '@/lib/audio-manager'

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

function extractSpotifyInfo(url: string): { type: string; id: string } | null {
  const match = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode)\/([a-zA-Z0-9]+)/)
  return match ? { type: match[1], id: match[2] } : null
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
  }
  onWidescreen?: () => void
  isMobile?: boolean
  tileSize?: number
  aspect?: string
  isPublicView?: boolean
}

/**
 * Content Card - Quantum Performance Edition
 *
 * FACADE 2.0: Thumbnails first, iframes on click
 * Vapor Boxes: Skeleton placeholders with aspect-ratio
 * 800ms Materialization: Fade-in on media load
 * One Sound Policy: AudioManager integration
 * ALL iframes: lazy loaded via IntersectionObserver
 */
export default function ContentCard({ content, onWidescreen, isMobile = false, tileSize = 1, aspect = 'square', isPublicView = false }: ContentCardProps) {
  const aspectClass = aspect === 'wide' ? 'aspect-video' : aspect === 'tall' ? 'aspect-[9/16]' : aspect === 'auto' ? '' : 'aspect-square'
  const fitClass = 'object-contain'
  const icon = getContentIcon(content.type as ContentType)
  const customBg = getContentBackground(content.type as ContentType)
  const [isActivated, setIsActivated] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
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
    const isAudioType = ['youtube', 'soundcloud', 'spotify', 'applemusic'].includes(content.type)
    if (!isAudioType) return
    audioManager.register(audioIdRef.current, () => {
      setIsActivated(false)
    })
    return () => audioManager.unregister(audioIdRef.current)
  }, [content.type, content.id])

  const handleActivate = () => {
    if (['youtube', 'soundcloud', 'spotify', 'applemusic'].includes(content.type)) {
      audioManager.play(audioIdRef.current)
    }
    setIsActivated(true)
  }

  // ════════════════════════════════════════
  // YOUTUBE — FACADE 2.0
  // Thumbnail first. Click swaps to clean iframe.
  // Zero iframes on page load.
  // ════════════════════════════════════════
  if (content.type === 'youtube') {
    const videoId = extractYouTubeId(content.url)
    const thumbnailUrl = content.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null)

    if (!isActivated && thumbnailUrl) {
      return (
        <div
          ref={containerRef}
          className={`w-full ${aspectClass} fp-tile overflow-hidden cursor-pointer relative group`}
          onClick={handleActivate}
        >
          <Image
            src={thumbnailUrl}
            alt=""
            width={tileSize >= 2 ? 800 : 480}
            height={tileSize >= 2 ? 800 : 270}
            sizes={tileSize >= 3 ? '(max-width: 768px) 100vw, 75vw' : tileSize >= 2 ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 50vw, 25vw'}
            className={`w-full h-full ${fitClass} transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            quality={75}
            onLoad={() => setIsLoaded(true)}
            onError={() => setIsLoaded(true)}
          />
          {/* Play button — always visible for clear affordance */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-3 h-3 text-white/80 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
      )
    }
    // Activated — clean iframe with autoplay (privacy-friendly domain)
    if (videoId) {
      return (
        <div className={`w-full ${aspectClass} fp-tile overflow-hidden relative materialize`}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
            loading="lazy"
          />
          <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-white/60 z-10" />
        </div>
      )
    }
  }

  // ════════════════════════════════════════
  // SPOTIFY — album art facade on mobile, iframe on desktop
  // ════════════════════════════════════════
  if (content.type === 'spotify') {
    const spotifyInfo = extractSpotifyInfo(content.url)
    if (spotifyInfo) {
      // Mobile at size 1: show album art card → tapping opens Spotify
      if (isMobile && tileSize <= 1) {
        return (
          <a
            ref={containerRef as any}
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`block w-full ${aspectClass} fp-tile overflow-hidden relative bg-[#191414] cursor-pointer group`}
          >
            {content.thumbnail_url && isInView && (
              <Image
                src={content.thumbnail_url}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className={`${fitClass} transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="lazy"
                quality={75}
                onLoad={() => setIsLoaded(true)}
              />
            )}
            {/* Scrim + play button */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-0 flex flex-col items-end justify-end p-3 gap-1.5">
              <p className="text-white text-xs font-medium leading-tight line-clamp-2 w-full">
                {content.title || 'Spotify'}
              </p>
            </div>
            <div className="absolute top-2.5 right-2.5">
              <div className="w-7 h-7 rounded-full bg-[#1DB954]/80 flex items-center justify-center group-hover:scale-105 transition-transform">
                <svg className="w-3 h-3 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          </a>
        )
      }
      // Desktop or size 2+: compact embed with explicit dimensions
      const isCollection = ['playlist', 'album', 'artist'].includes(spotifyInfo.type)
      const embedHeight = isCollection ? 352 : 152
      return (
        <div ref={containerRef} className="w-full fp-tile overflow-hidden bg-[#191414]" style={{ height: `${embedHeight}px`, maxWidth: '100%' }}>
          {isInView ? (
            <iframe
              style={{ border: 'none', background: 'transparent', maxWidth: '100%' }}
              src={`https://open.spotify.com/embed/${spotifyInfo.type}/${spotifyInfo.id}?theme=0`}
              width="100%"
              height="100%"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="materialize"
            />
          ) : (
            <div className="w-full h-full bg-[#191414]" />
          )}
        </div>
      )
    }
    return (
      <a href={content.url} target="_blank" rel="noopener noreferrer"
        className="block w-full h-full fp-tile overflow-hidden flex items-center justify-center">
        <span className="text-white/40 text-xs tracking-wider">spotify</span>
      </a>
    )
  }

  // ════════════════════════════════════════
  // SOUNDCLOUD — FACADE 2.0
  // Gradient card first. Click loads embed.
  // ════════════════════════════════════════
  if (content.type === 'soundcloud') {
    if (!isActivated) {
      return (
        <div
          className={`w-full ${aspectClass} fp-tile overflow-hidden cursor-pointer relative group bg-black`}
          onClick={handleActivate}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#ff5500]/80 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-3 h-3 text-white/80 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <p className="text-white/40 text-[10px] font-medium truncate max-w-[80%]">{content.title || 'SoundCloud'}</p>
          </div>
        </div>
      )
    }
    if (content.embed_html) {
      return (
        <div
          className={`w-full ${aspectClass} fp-tile overflow-hidden materialize bg-black [&_iframe]:!h-full`}
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />
      )
    }
  }

  // ════════════════════════════════════════
  // APPLE MUSIC — lazy loaded dark embed
  // ════════════════════════════════════════
  if (content.type === 'applemusic' && content.embed_html) {
    let darkEmbed = content.embed_html.replace(
      /src="(https:\/\/embed\.music\.apple\.com\/[^"]*?)"/g,
      (_m: string, url: string) => `src="${url}${url.includes('?') ? '&' : '?'}theme=dark"`
    )
    darkEmbed = darkEmbed.replace(/<iframe /g, '<iframe scrolling="no" ')
    return (
      <div ref={containerRef} className="w-full fp-tile overflow-hidden bg-black" style={{ height: '175px', maxWidth: '100%' }}>
        {isInView ? (
          <div
            className="w-full h-full overflow-hidden [&_iframe]:!w-full [&_iframe]:!h-full [&_iframe]:!max-w-full [&_iframe]:!min-h-0 [&_iframe]:!border-0 [&_iframe]:!overflow-hidden materialize"
            style={{ overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: darkEmbed }}
          />
        ) : null}
      </div>
    )
  }

  // ════════════════════════════════════════
  // VIMEO — lazy loaded embed
  // ════════════════════════════════════════
  if (content.type === 'vimeo' && content.embed_html) {
    return (
      <div ref={containerRef} className={`w-full ${aspectClass} fp-tile overflow-hidden relative bg-black`}>
        {isInView ? (
          <div
            className="absolute inset-0 [&_iframe]:!w-full [&_iframe]:!h-full materialize"
            dangerouslySetInnerHTML={{ __html: content.embed_html }}
          />
        ) : null}
      </div>
    )
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
            className={`w-full ${aspectClass} ${fitClass} transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoadedData={(e) => { setIsLoaded(true); (e.target as HTMLVideoElement).play().catch(() => {}) }}
          />
        ) : (
          <div className={`w-full ${aspectClass}`} />
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
        <div
          className={`absolute inset-0 vapor-box fp-tile ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
        />
        <a href={content.url} target="_blank" rel="noopener noreferrer">
          <Image
            src={content.url}
            alt={content.title || ''}
            width={600}
            height={800}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full h-auto object-contain transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            quality={75}
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
    // Adaptive sizing: short → big and bold, long → smaller
    const typo = len <= 6
      ? 'text-[28px] font-light tracking-[-0.035em] leading-none'
      : len <= 20
      ? 'text-[18px] font-light tracking-[-0.025em] leading-tight'
      : len <= 60
      ? 'text-[15px] font-light tracking-[-0.01em] leading-snug'
      : 'text-[15px] font-light tracking-[-0.01em] leading-relaxed'

    // Glassmorphic annotation style for public view
    if (isPublicView) {
      return (
        <div
          className="w-full h-full flex items-center justify-center p-5"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px) saturate(120%)',
            WebkitBackdropFilter: 'blur(20px) saturate(120%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontFamily: "'DM Sans', sans-serif",
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
      <div className="w-full h-full fp-tile fp-surface flex items-center justify-center p-5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <p className={`whitespace-pre-wrap text-center opacity-85 ${typo}`}>
          {text}
        </p>
      </div>
    )
  }

  // ════════════════════════════════════════
  // SOCIAL — Twitter, Instagram, TikTok
  // ════════════════════════════════════════
  if (['twitter', 'instagram', 'tiktok'].includes(content.type)) {
    if (content.thumbnail_url) {
      return (
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          ref={containerRef as any}
          className="block fp-tile overflow-hidden relative"
        >
          <div
            className={`absolute inset-0 vapor-box fp-tile ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
            style={{ aspectRatio: aspect === 'wide' ? '16/9' : aspect === 'tall' ? '9/16' : '1/1' }}
          />
          <Image
            src={content.thumbnail_url}
            alt=""
            width={400}
            height={400}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full ${aspectClass} ${fitClass} transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            quality={75}
            onLoad={() => setIsLoaded(true)}
          />
          <span className="absolute bottom-2 left-2.5 text-[9px] font-mono tracking-wider text-white/40">
            {content.type}
          </span>
        </a>
      )
    }
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block fp-tile overflow-hidden ${aspectClass} fp-surface flex items-center justify-center`}
      >
        <span className="text-[10px] font-mono tracking-[0.15em] uppercase opacity-40">
          {content.type}
        </span>
      </a>
    )
  }

  // ════════════════════════════════════════
  // DEFAULT LINK — visual tile, not a list card
  // ════════════════════════════════════════
  if (content.thumbnail_url) {
    // WITH thumbnail — image fills tile, domain label overlay
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        ref={containerRef as any}
        className={`block w-full ${aspectClass} fp-tile overflow-hidden relative`}
      >
        <Image
          src={content.thumbnail_url}
          alt={content.title || ''}
          fill
          sizes={tileSize >= 2 ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 50vw, 25vw'}
          className={`object-contain transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          quality={75}
          onLoad={() => setIsLoaded(true)}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent h-10" />
        <span className="absolute bottom-2 left-2.5 text-[9px] font-mono tracking-wider text-white/50">
          {hostname}
        </span>
      </a>
    )
  }

  // WITHOUT thumbnail — typographic tile, domain IS the content
  return (
    <a
      href={content.url}
      target="_blank"
      rel="noopener noreferrer"
      ref={containerRef as any}
      className={`block w-full ${aspectClass} fp-tile overflow-hidden fp-surface flex items-center justify-center p-4`}
    >
      <span className="text-sm font-mono tracking-wider opacity-60 text-center truncate max-w-full">
        {hostname}
      </span>
    </a>
  )
}
