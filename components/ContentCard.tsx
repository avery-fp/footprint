'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import type { ContentType } from '@/lib/parser'
import { audioManager } from '@/lib/audio-manager'
import { parseEmbed, getYouTubeThumbnail, extractYouTubeId } from '@/lib/parseEmbed'
import type { EmbedResult } from '@/lib/parseEmbed'

function extractSpotifyInfo(url: string): { type: string; id: string } | null {
  const match = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
  return match ? { type: match[1], id: match[2] } : null
}

// ════════════════════════════════════════
// AE Glass Embed Frame — universal frosted glass wrapper for all embeds
// ════════════════════════════════════════

const GLASS_STYLE: React.CSSProperties = {
  borderRadius: '16px',
  background: 'rgba(255, 255, 255, 0.06)',
  backdropFilter: 'blur(22px) saturate(140%)',
  WebkitBackdropFilter: 'blur(22px) saturate(140%)',
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
}

function GlassEmbedFrame({
  src,
  height,
  allow,
  sandbox,
  allowFullScreen,
  onError,
  onLoad: onLoadCallback,
  children,
}: {
  src: string
  height?: number
  allow?: string
  sandbox?: string
  allowFullScreen?: boolean
  onError?: () => void
  onLoad?: () => void
  children?: React.ReactNode
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleLoad = () => {
    setLoaded(true)
    onLoadCallback?.()
  }

  const handleError = () => {
    setFailed(true)
    onError?.()
  }

  if (failed) {
    return (
      <div
        className="glass-embed-frame relative w-full h-full overflow-hidden flex items-center justify-center"
        style={{ ...GLASS_STYLE, ...(height ? { height: `${height}px` } : {}) }}
      >
        <span className="text-xs text-white/40 font-mono" style={{ opacity: 0.7 }}>embed unavailable</span>
      </div>
    )
  }

  return (
    <div
      className="glass-embed-frame relative w-full h-full overflow-hidden"
      style={{ ...GLASS_STYLE, ...(height ? { height: `${height}px` } : {}) }}
    >
      <iframe
        src={src}
        width="100%"
        height="100%"
        allow={allow}
        sandbox={sandbox}
        allowFullScreen={allowFullScreen}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          background: 'transparent',
          overflow: 'hidden',
          padding: 0,
          margin: 0,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 250ms ease-out',
        }}
      />
      {children}
    </div>
  )
}

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
      if (!url.includes('color=white')) return url + sep + 'color=white'
      return url
    case 'spotify':
      if (!url.includes('theme=0')) return url + sep + 'theme=0'
      return url
    case 'soundcloud':
      // visual=true + white controls already dark; ensure color param
      if (!url.includes('color=')) return url + sep + 'color=%23000000'
      return url
    case 'vimeo':
      return url + (url.includes('color=') ? '' : sep + 'color=ffffff')
    default:
      return url
  }
}

// Glass placeholder for offscreen embeds
function GlassPlaceholder({ height, aspectClass }: { height?: number; aspectClass?: string }) {
  return (
    <div
      className={`w-full h-full ${aspectClass || ''}`}
      style={{ ...GLASS_STYLE, ...(height ? { height: `${height}px` } : {}) }}
    />
  )
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
 * Content Card — Universal Embed Engine
 *
 * Zero-error contract: every URL renders something intentional.
 * parseEmbed → iframe tile (with silent fallback to link card)
 * null → link card (OG metadata via /api/og-preview)
 * Everything fails gracefully. No broken states.
 */
export default function ContentCard({ content, onWidescreen, isMobile = false, tileSize = 1, aspect = 'square', isPublicView = false }: ContentCardProps) {
  const aspectClass = aspect === 'wide' ? 'aspect-video' : aspect === 'tall' ? 'aspect-[9/16]' : aspect === 'auto' ? '' : 'aspect-square'
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
  const youtubeId = content.type === 'youtube' ? extractYouTubeId(content.url) : null
  if (content.type === 'youtube' && youtubeId && !iframeFailed) {
    // Facade — always shows a thumbnail, never collapses
    if (!isActivated) {
      const thumbSrc = content.thumbnail_url || `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`
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
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement
              const hqFallback = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
              if (!img.src.includes('hqdefault')) {
                img.src = hqFallback
              }
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
      )
    }
    // Activated — swap facade for glass iframe
    const ytSrc = enforceEmbedDarkMode(
      `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`,
      'youtube'
    )
    return (
      <div
        ref={containerRef}
        className="w-full h-full fp-tile overflow-hidden relative"
      >
        <GlassEmbedFrame
          src={ytSrc}
          allow="autoplay; encrypted-media"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
          onError={() => setIframeFailed(true)}
        />
      </div>
    )
  }

  // ════════════════════════════════════════
  // SPOTIFY — album art facade on mobile, iframe on desktop
  // ════════════════════════════════════════
  if (content.type === 'spotify') {
    const spotifyInfo = extractSpotifyInfo(content.url)
    if (spotifyInfo) {
      // Compact glass player for small tiles (any device)
      // Click bubbles to grid wrapper → opens lightbox with proper Spotify embed
      if (tileSize <= 1) {
        return (
          <div
            ref={containerRef}
            className={`w-full h-full ${aspectClass || 'aspect-square'} fp-tile overflow-hidden relative cursor-pointer group`}
            style={{
              ...GLASS_STYLE,
              borderRadius: 'inherit',
            }}
          >
            {content.thumbnail_url && isInView && (
              <Image
                src={content.thumbnail_url}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className={fitClass}
                loading="lazy"
                quality={75}
                onLoad={() => setIsLoaded(true)}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-lg">
                <svg className="w-3.5 h-3.5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <p className="text-white text-xs font-medium leading-tight line-clamp-2 min-w-0">
                {content.title || 'Spotify'}
              </p>
            </div>
          </div>
        )
      }
      const embed = parseEmbed(content.url)
      if (embed) {
        const spotifySrc = enforceEmbedDarkMode(embed.embedUrl, 'spotify')
        const spotifyHeight = embed.height || getAEEmbedHeight('spotify')

        return (
          <div
            ref={containerRef}
            className="w-full fp-tile overflow-hidden rounded-[inherit]"
            style={{ height: `${spotifyHeight}px` }}
          >
            {isInView ? (
              <GlassEmbedFrame
                src={spotifySrc}
                height={spotifyHeight}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                onError={() => setIframeFailed(true)}
              />
            ) : (
              <GlassPlaceholder height={spotifyHeight} />
            )}
          </div>
        )
    }
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
    if (embed) {
      const scSrc = enforceEmbedDarkMode(embed.embedUrl, 'soundcloud')
      const scHeight = embed.height || getAEEmbedHeight('soundcloud')
      return (
        <div
          ref={containerRef}
          className="w-full fp-tile overflow-hidden"
          style={{ height: `${scHeight}px` }}
        >
          <GlassEmbedFrame
            src={scSrc}
            height={scHeight}
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-popups"
            onError={() => setIframeFailed(true)}
          />
        </div>
      )
    }
    // Fallback: use stored embed_html if parseEmbed didn't match
    if (content.embed_html) {
      return (
        <div
          className={`w-full ${aspectClass} fp-tile overflow-hidden bg-black [&_iframe]:!h-full`}
          dangerouslySetInnerHTML={{ __html: content.embed_html }}
        />
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
            src={content.url}
            alt={content.title || ''}
            width={600}
            height={800}
            sizes="(max-width: 768px) 50vw, 25vw"
            className="w-full h-full object-cover"
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
          <Image
            src={content.thumbnail_url}
            alt=""
            width={400}
            height={400}
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`w-full ${aspectClass} ${fitClass}`}
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
  // LINK CARD — beautiful fallback for everything else
  // Favicon + title + domain. Works for any URL on earth.
  // ════════════════════════════════════════
  if (content.thumbnail_url) {
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
          className="object-cover"
          loading="lazy"
          quality={75}
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsLoaded(true)}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent h-10" />
        <span className="absolute bottom-2 left-2.5 text-[9px] font-mono tracking-wider text-white/50">
          {hostname}
        </span>
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
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// LINK CARD — frosted glass with OG metadata
// Favicon + title + domain. The universal fallback.
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
    favicon?: string | null
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
  const favicon = meta?.favicon
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
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent h-16" />
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-2">
          {favicon && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={favicon} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
          <span className="text-[10px] font-mono tracking-wider text-white/70 truncate">
            {hostname}
          </span>
        </div>
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
          {favicon && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={favicon} alt="" className="w-5 h-5 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
          <span className="text-[11px] font-mono tracking-wider text-white/50 text-center truncate max-w-full">
            {displayTitle !== hostname ? displayTitle : hostname}
          </span>
          {displayTitle !== hostname && (
            <span className="text-[9px] font-mono tracking-wider text-white/30">
              {hostname}
            </span>
          )}
        </div>
      </a>
    )
  }

  // Text-only link card — frosted glass, favicon + title + domain
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
      {favicon && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={favicon} alt="" className="w-5 h-5 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      )}
      <span className="text-[11px] font-mono tracking-wider text-white/50 text-center truncate max-w-full">
        {displayTitle !== hostname ? displayTitle : hostname}
      </span>
      {displayTitle !== hostname && (
        <span className="text-[9px] font-mono tracking-wider text-white/30">
          {hostname}
        </span>
      )}
    </a>
  )
}
