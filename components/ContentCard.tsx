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
  const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/)
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
}

/**
 * Content Card - Quantum Performance Edition
 *
 * FACADE 2.0: Thumbnails first, iframes on click
 * Vapor Boxes: Skeleton placeholders with aspect-ratio
 * 800ms Materialization: Fade-in on media load
 * One Sound Policy: AudioManager integration
 */
export default function ContentCard({ content, onWidescreen }: ContentCardProps) {
  const icon = getContentIcon(content.type)
  const customBg = getContentBackground(content.type)
  const [isActivated, setIsActivated] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioIdRef = useRef(`card-${content.id}`)

  // IntersectionObserver — only load images when near viewport
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

  // All tiles are aspect-square in the grid — no auto widescreen

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
          className="w-full aspect-square rounded-xl overflow-hidden cursor-pointer relative group"
          onClick={handleActivate}
        >
          <Image
            src={isInView ? thumbnailUrl : ''}
            alt=""
            width={480}
            height={270}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full h-full object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            quality={75}
            onLoad={() => setIsLoaded(true)}
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
        <div className="w-full aspect-square rounded-xl overflow-hidden relative materialize">
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
  // SPOTIFY — FACADE: album art + play button, click loads embed
  // ════════════════════════════════════════
  if (content.type === 'spotify') {
    const spotifyInfo = extractSpotifyInfo(content.url)
    const embedHeight = spotifyInfo?.type === 'track' ? 152 : 352

    if (!isActivated && content.thumbnail_url) {
      return (
        <div
          ref={containerRef}
          className="w-full aspect-square rounded-xl overflow-hidden cursor-pointer relative group bg-black"
          onClick={handleActivate}
        >
          <Image
            src={isInView ? content.thumbnail_url : ''}
            alt=""
            width={400}
            height={400}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full h-full object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            quality={75}
            onLoad={() => setIsLoaded(true)}
          />
          {/* Dark overlay for cohesion */}
          <div className="absolute inset-0 bg-black/30" />
          {/* Compact dark player bar at bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-md px-3 py-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <svg className="w-3.5 h-3.5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span className="text-[10px] text-white/60 font-medium truncate">{content.title || 'Spotify'}</span>
            <svg className="w-3 h-3 text-[#1DB954] flex-shrink-0 ml-auto" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
          </div>
        </div>
      )
    }

    // Activated — album art bg (dimmed) with Spotify embed pinned to bottom
    if (spotifyInfo) {
      const compactHeight = spotifyInfo.type === 'track' ? 80 : 152
      return (
        <div className="w-full aspect-square rounded-xl overflow-hidden relative materialize bg-black">
          {content.thumbnail_url && (
            <img
              src={content.thumbnail_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-50"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0" style={{ height: compactHeight }}>
            <iframe
              style={{ borderRadius: 0, border: 'none' }}
              src={`https://open.spotify.com/embed/${spotifyInfo.type}/${spotifyInfo.id}?theme=0`}
              width="100%"
              height="100%"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            />
          </div>
        </div>
      )
    }

    // Fallback — no thumbnail, no parseable URL
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full aspect-square rounded-xl overflow-hidden cursor-pointer relative group bg-black"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#1DB954] flex items-center justify-center">
            <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <p className="text-white/50 text-[10px] font-medium">{content.title || 'Spotify'}</p>
        </div>
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
          className="w-full aspect-square rounded-xl overflow-hidden cursor-pointer relative group bg-black"
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
          className="w-full aspect-square rounded-xl overflow-hidden materialize bg-black [&_iframe]:!h-full"
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />
      )
    }
  }

  // ════════════════════════════════════════
  // APPLE MUSIC — embed with materialization
  // ════════════════════════════════════════
  if (content.type === 'applemusic' && content.embed_html) {
    // Facade: album art (or dark placeholder) + play button, click activates embed
    if (!isActivated) {
      return (
        <div
          ref={containerRef}
          className="w-full aspect-square rounded-xl overflow-hidden cursor-pointer relative group bg-black"
          onClick={handleActivate}
        >
          {content.thumbnail_url ? (
            <Image
              src={isInView ? content.thumbnail_url : ''}
              alt=""
              width={400}
              height={400}
              sizes="(max-width: 768px) 50vw, 25vw"
              className={`w-full h-full object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
              quality={75}
              onLoad={() => setIsLoaded(true)}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#fc3c44]/20 to-black" />
          )}
          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-[#fc3c44] flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
          {/* Apple Music badge */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
            <span className="text-[9px] text-white/60 font-medium">{content.title || 'Apple Music'}</span>
          </div>
        </div>
      )
    }
    // Activated: dark themed embed, overflow hidden, no scroll
    const darkEmbed = content.embed_html.replace(
      /src="(https:\/\/embed\.music\.apple\.com\/[^"]*?)"/g,
      (match: string, url: string) => `src="${url}${url.includes('?') ? '&' : '?'}theme=dark"`
    )
    return (
      <div className="w-full aspect-square rounded-xl overflow-hidden relative materialize bg-black">
        <div
          className="absolute inset-0 overflow-hidden [&_iframe]:!w-full [&_iframe]:!h-full [&_iframe]:!min-h-0 [&_iframe]:!border-0 [&_iframe]:!bg-transparent [&_iframe]:!overflow-hidden"
          style={{ overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: darkEmbed }}
        />
      </div>
    )
  }

  // ════════════════════════════════════════
  // VIMEO — embed with materialization
  // ════════════════════════════════════════
  if (content.type === 'vimeo' && content.embed_html) {
    return (
      <div className="w-full aspect-square rounded-xl overflow-hidden relative materialize bg-black">
        <div
          className="absolute inset-0 [&_iframe]:!w-full [&_iframe]:!h-full"
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />
      </div>
    )
  }

  // ════════════════════════════════════════
  // VIDEO (native) — with vapor box
  // ════════════════════════════════════════
  if (content.type === 'video') {
    return (
      <div className="rounded-xl overflow-hidden relative">
        <div
          className={`absolute inset-0 rounded-xl ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
          style={{ aspectRatio: '1/1' }}
        />
        <video
          src={content.url}
          autoPlay
          muted
          loop
          playsInline
          controls
          className={`w-full aspect-square object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={() => setIsLoaded(true)}
        />
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
            src={isInView ? content.url : ''}
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
  // THOUGHT — glass text card
  // ════════════════════════════════════════
  if (content.type === 'thought') {
    return (
      <div
        className="rounded-xl overflow-hidden p-8 border border-white/[0.06] hover:border-white/15 transition-all bg-white/[0.08] backdrop-blur-xl"
      >
        <p className="text-base leading-relaxed whitespace-pre-wrap text-white/90">
          {content.title || content.description || ''}
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
            style={{ aspectRatio: '1/1' }}
          />
          <Image
            src={isInView ? content.thumbnail_url : ''}
            alt=""
            width={400}
            height={400}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full aspect-square object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
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
        className="block rounded-xl overflow-hidden aspect-square border border-white/[0.08] hover:border-white/15 transition-all flex items-center justify-center bg-white/[0.08]"
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
            src={isInView ? content.thumbnail_url : ''}
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
