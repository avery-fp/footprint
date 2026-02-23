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
    type: ContentType
    title: string | null
    description: string | null
    thumbnail_url: string | null
    embed_html: string | null
  }
  onWidescreen?: () => void
  isMobile?: boolean
  tileSize?: number
  aspect?: string
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
export default function ContentCard({ content, onWidescreen, isMobile = false, tileSize = 1, aspect = 'square' }: ContentCardProps) {
  const aspectClass = aspect === 'wide' ? 'aspect-video' : aspect === 'tall' ? 'aspect-[9/16]' : aspect === 'auto' ? '' : 'aspect-square'
  const fitClass = aspect === 'auto' ? 'object-contain' : 'object-cover'
  const icon = getContentIcon(content.type)
  const customBg = getContentBackground(content.type)
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
          className={`w-full ${aspectClass} rounded-xl overflow-hidden cursor-pointer relative group`}
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
          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
      )
    }
    // Activated — clean iframe with autoplay
    if (videoId) {
      return (
        <div className={`w-full ${aspectClass} rounded-xl overflow-hidden relative materialize`}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
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
            className={`block w-full ${aspectClass} rounded-xl overflow-hidden relative bg-[#191414] cursor-pointer group`}
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
              <div className="w-9 h-9 rounded-full bg-[#1DB954] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          </a>
        )
      }
      // Desktop or size 2+: lazy load iframe
      return (
        <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden flex items-center justify-center bg-transparent">
          {isInView ? (
            <iframe
              style={{ border: 'none', borderRadius: '12px', background: 'transparent' }}
              src={`https://open.spotify.com/embed/${spotifyInfo.type}/${spotifyInfo.id}?theme=0`}
              width="100%"
              height="100%"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-[#191414] rounded-xl" />
          )}
        </div>
      )
    }
    return (
      <a href={content.url} target="_blank" rel="noopener noreferrer"
        className="block w-full h-full rounded-xl overflow-hidden flex items-center justify-center">
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
          className={`w-full ${aspectClass} rounded-xl overflow-hidden cursor-pointer relative group bg-black`}
          onClick={handleActivate}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#ff5500] flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <p className="text-white/50 text-[10px] font-medium truncate max-w-[80%]">{content.title || 'SoundCloud'}</p>
          </div>
        </div>
      )
    }
    if (content.embed_html) {
      return (
        <div
          className={`w-full ${aspectClass} rounded-xl overflow-hidden materialize bg-black [&_iframe]:!h-full`}
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
      <div ref={containerRef} className={`w-full ${aspectClass} rounded-xl overflow-hidden bg-black`}>
        {isInView ? (
          <div
            className="w-full h-full overflow-hidden [&_iframe]:!w-full [&_iframe]:!h-full [&_iframe]:!min-h-0 [&_iframe]:!border-0 [&_iframe]:!overflow-hidden"
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
      <div ref={containerRef} className={`w-full ${aspectClass} rounded-xl overflow-hidden relative bg-black`}>
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
      <div ref={containerRef} className="rounded-xl overflow-hidden relative">
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
      <div ref={containerRef} className="rounded-xl overflow-hidden relative">
        <div
          className={`absolute inset-0 vapor-box rounded-xl ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
        />
        <a href={content.url} target="_blank" rel="noopener noreferrer">
          <Image
            src={content.url}
            alt={content.title || ''}
            width={600}
            height={800}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full h-auto object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
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
      ? 'text-[28px] font-normal tracking-[-0.035em] leading-none'
      : len <= 20
      ? 'text-[18px] font-normal tracking-[-0.025em] leading-tight'
      : len <= 60
      ? 'text-[14px] font-normal tracking-[-0.01em] leading-snug'
      : 'text-[13px] font-normal tracking-[-0.01em] leading-relaxed'

    return (
      <div className="w-full h-full rounded-xl bg-white/[0.07] backdrop-blur-md flex items-center justify-center p-5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <p className={`whitespace-pre-wrap text-white/90 text-center ${typo}`}>
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
          className="block rounded-xl overflow-hidden relative"
        >
          <div
            className={`absolute inset-0 vapor-box rounded-xl ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
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
          <div className="absolute bottom-2 left-2 text-2xl opacity-80">
            {icon}
          </div>
        </a>
      )
    }
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block rounded-xl overflow-hidden ${aspectClass} border border-white/[0.08] hover:border-white/15 transition-all flex items-center justify-center bg-white/[0.08]`}
      >
        <div className="text-4xl opacity-40">
          {icon}
        </div>
      </a>
    )
  }

  // ════════════════════════════════════════
  // DEFAULT LINK — glass card
  // ════════════════════════════════════════
  return (
    <a
      href={content.url}
      target="_blank"
      rel="noopener noreferrer"
      ref={containerRef as any}
      className="rounded-xl overflow-hidden flex items-center gap-4 p-5 border border-white/[0.08] hover:border-white/15 transition-all bg-white/[0.08]"
    >
      <div
        className="w-12 h-12 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: customBg || 'rgba(255,255,255,0.1)' }}
      >
        {content.thumbnail_url ? (
          <Image
            src={content.thumbnail_url}
            alt=""
            width={48}
            height={48}
            sizes="48px"
            className="w-full h-full rounded-lg object-cover"
            loading="lazy"
            quality={75}
          />
        ) : (
          icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {content.title || hostname}
        </p>
        <p className="font-mono text-xs text-white/40 truncate">
          {hostname}
        </p>
      </div>
      <span className="text-white/30 text-lg flex-shrink-0">→</span>
    </a>
  )
}
