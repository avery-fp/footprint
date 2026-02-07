'use client'

import { useState, useRef, useEffect } from 'react'
import { getContentIcon, getContentBackground, ContentType } from '@/lib/parser'
import { audioManager } from '@/lib/audio-manager'
import { transformImageUrl } from '@/lib/image'

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
    const isAudioType = ['youtube', 'soundcloud', 'spotify'].includes(content.type)
    if (!isAudioType) return
    audioManager.register(audioIdRef.current, () => {
      setIsActivated(false)
    })
    return () => audioManager.unregister(audioIdRef.current)
  }, [content.type, content.id])

  // Notify parent about inherently widescreen content
  useEffect(() => {
    if (['youtube', 'vimeo', 'video'].includes(content.type)) {
      onWidescreen?.()
    }
  }, [content.type])

  const handleActivate = () => {
    if (['youtube', 'soundcloud', 'spotify'].includes(content.type)) {
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
          className="w-full aspect-video rounded-xl overflow-hidden cursor-pointer relative group"
          onClick={handleActivate}
        >
          <img
            src={isInView ? transformImageUrl(thumbnailUrl) : undefined}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
          />
          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
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
        <div className="w-full aspect-video rounded-xl overflow-hidden relative materialize">
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
  // SPOTIFY — direct iframe embed
  // ════════════════════════════════════════
  if (content.type === 'spotify') {
    const spotifyInfo = extractSpotifyInfo(content.url)
    if (spotifyInfo) {
      return (
        <div className="rounded-xl overflow-hidden">
          <iframe
            style={{ borderRadius: 12 }}
            src={`https://open.spotify.com/embed/${spotifyInfo.type}/${spotifyInfo.id}?theme=0`}
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
      )
    }
    return (
      <a
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl overflow-hidden p-6"
        style={{ background: 'linear-gradient(135deg, #1DB954, #191414)' }}
      >
        <p className="text-white/90 text-sm">Listen on Spotify →</p>
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
          className="rounded-xl overflow-hidden p-6 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #ff5500, #ff7700)' }}
          onClick={handleActivate}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="text-3xl">♫</div>
            <p className="font-mono text-xs text-white/60 uppercase tracking-wider">SoundCloud</p>
          </div>
          <p className="text-white/90 text-sm truncate">{content.title || 'Listen on SoundCloud'}</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-sm ml-0.5">▶</span>
            </div>
            <span className="text-white/40 text-xs font-mono">Tap to play</span>
          </div>
        </div>
      )
    }
    if (content.embed_html) {
      return (
        <div
          className="w-full min-h-[166px] rounded-xl overflow-hidden materialize"
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />
      )
    }
  }

  // ════════════════════════════════════════
  // APPLE MUSIC — embed with materialization
  // ════════════════════════════════════════
  if (content.type === 'applemusic' && content.embed_html) {
    return (
      <div className="rounded-xl overflow-hidden relative materialize">
        <div
          className="w-full min-h-[175px]"
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />
      </div>
    )
  }

  // ════════════════════════════════════════
  // VIMEO — embed with materialization
  // ════════════════════════════════════════
  if (content.type === 'vimeo' && content.embed_html) {
    return (
      <div className="rounded-xl overflow-hidden relative materialize">
        <div
          className="w-full min-h-[200px]"
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
          className={`absolute inset-0 vapor-box rounded-xl ${isLoaded ? 'opacity-0' : ''} transition-opacity duration-500`}
          style={{ aspectRatio: '16/9' }}
        />
        <video
          src={content.url}
          autoPlay
          muted
          loop
          playsInline
          controls
          className={`w-full aspect-video object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
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
          <img
            src={isInView ? transformImageUrl(content.url) : undefined}
            alt={content.title || ''}
            className={`w-full object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
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
  // THOUGHT — glass text card
  // ════════════════════════════════════════
  if (content.type === 'thought') {
    return (
      <div
        className="rounded-xl overflow-hidden p-8 border border-white/[0.06] hover:border-white/15 transition-all bg-white/[0.08] backdrop-blur-md"
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
          <img
            src={isInView ? transformImageUrl(content.thumbnail_url) : undefined}
            alt=""
            className={`w-full aspect-square object-cover transition-opacity duration-[800ms] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
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
          <img
            src={isInView ? transformImageUrl(content.thumbnail_url) : undefined}
            alt=""
            className="w-full h-full rounded-lg object-cover"
            loading="lazy"
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
