'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ════════════════════════════════════════
// GHOST TILE — de-branded media renderer
//
// Strips platform chrome. Renders under Footprint's aesthetic.
// Architecture:
//   Audio pipe  — Spotify, SoundCloud: hidden iframe, custom UI is the player
//   Visual pipe — Vimeo: blurred bg + iframe reveal on play
//   YouTube pipe — facade-first: sharp thumbnail always visible,
//                  iframe mounts on click, facade hides ONLY after
//                  confirmed playback. Error 153 = graceful fallback.
// ════════════════════════════════════════

const GHOST_PAUSE_EVENT = 'ghost-tile-pause'

type Archetype = 'audio' | 'youtube' | 'visual'

function getArchetype(platform: string, _url: string): Archetype {
  if (platform === 'spotify') return 'audio'
  if (platform === 'soundcloud') return 'audio'
  if (platform === 'youtube') return 'youtube'
  if (platform === 'vimeo') return 'visual'
  return 'visual'
}

interface GhostTileProps {
  url: string
  platform: string
  media_id: string
  title?: string
  artist?: string
  thumbnail_url?: string
  size?: number
  onPlay?: () => void
}

export default function GhostTile({
  url,
  platform,
  media_id,
  title,
  artist,
  thumbnail_url,
  size = 1,
  onPlay,
}: GhostTileProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const tileId = useRef(`ghost-${media_id}-${Math.random().toString(36).slice(2, 6)}`)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const archetype = getArchetype(platform, url)

  // Listen for pause events from other ghost tiles
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.except !== tileId.current) {
        setIsPlaying(false)
      }
    }
    window.addEventListener(GHOST_PAUSE_EVENT, handler)
    return () => window.removeEventListener(GHOST_PAUSE_EVENT, handler)
  }, [])

  const handlePlay = useCallback(() => {
    window.dispatchEvent(new CustomEvent(GHOST_PAUSE_EVENT, { detail: { except: tileId.current } }))
    setIsPlaying(true)
    onPlay?.()
  }, [onPlay])

  const handleToggle = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
    } else {
      handlePlay()
    }
  }, [isPlaying, handlePlay])

  // Thumbnail URL
  const thumbUrl = thumbnail_url || (
    platform === 'youtube' ? `https://i.ytimg.com/vi/${media_id}/maxresdefault.jpg` : null
  )

  // ════════════════════════════════════════
  // AUDIO PIPE — hidden iframe, custom play UI
  // (Spotify, SoundCloud)
  // ════════════════════════════════════════
  if (archetype === 'audio') {
    let iframeSrc: string | undefined
    const isSpotify = platform === 'spotify'

    if (isSpotify) {
      const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
      const spotifyType = spotifyMatch?.[1] || 'track'
      const spotifyId = spotifyMatch?.[2] || media_id
      iframeSrc = `https://open.spotify.com/embed/${spotifyType}/${spotifyId}?theme=0&autoplay=1`
    }

    return (
      <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
        {isSpotify && thumbUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.4) 100%)' }} />
          </>
        ) : (
          <ThumbnailBg src={thumbUrl} />
        )}

        {!isSpotify && (
          <div
            className="absolute inset-0"
            style={{
              background: isPlaying ? 'rgba(200, 160, 100, 0.05)' : 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              transition: 'background 0.25s ease',
            }}
          />
        )}

        {isPlaying && iframeSrc && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="absolute"
            style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            allow="autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        )}

        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer"
          style={{ zIndex: 2 }}
          onClick={handleToggle}
        >
          {isPlaying ? <WaveformBars /> : <PlayIcon />}
          <TitleBlock title={title} artist={artist} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // YOUTUBE PIPE — facade-first architecture
  //
  // State machine:
  //   idle     → sharp thumbnail + play icon (facade visible)
  //   loading  → user clicked, iframe mounted behind facade
  //   playing  → YouTube confirmed playback, fade facade out
  //   failed   → timeout/error, keep facade, show "Watch on YouTube →"
  // ════════════════════════════════════════
  if (archetype === 'youtube') {
    return (
      <YouTubePipe
        media_id={media_id}
        title={title}
        artist={artist}
        thumbUrl={thumbUrl}
        tileId={tileId}
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onToggle={handleToggle}
      />
    )
  }

  // ════════════════════════════════════════
  // VISUAL PIPE — Vimeo
  // Blurred thumbnail bg + iframe reveal on play
  // ════════════════════════════════════════
  const iframeSrc = platform === 'vimeo'
    ? `https://player.vimeo.com/video/${media_id}?title=0&byline=0&portrait=0&autoplay=1`
    : undefined

  return (
    <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
      <ThumbnailBg src={thumbUrl} />

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          opacity: isPlaying ? 0 : 1,
          pointerEvents: isPlaying ? 'none' : 'auto',
          transition: 'opacity 0.25s ease',
          zIndex: 2,
        }}
        onClick={handlePlay}
      >
        <PlayIcon />
        <TitleBlock title={title} artist={artist} />
      </div>

      {isPlaying && iframeSrc && (
        <div
          className="absolute inset-0"
          style={{
            opacity: iframeLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
            zIndex: 1,
          }}
        >
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="w-full h-full"
            style={{ border: 'none' }}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════
// YOUTUBE PIPE — dedicated component with state machine
// ════════════════════════════════════════

type YTState = 'idle' | 'loading' | 'playing' | 'failed'

function YouTubePipe({
  media_id,
  title,
  artist,
  thumbUrl,
  tileId,
  isPlaying,
  onPlay,
  onToggle,
}: {
  media_id: string
  title?: string
  artist?: string
  thumbUrl: string | null
  tileId: React.MutableRefObject<string>
  isPlaying: boolean
  onPlay: () => void
  onToggle: () => void
}) {
  const [ytState, setYtState] = useState<YTState>('idle')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gotAnyMessage = useRef(false)

  // Thumbnail fallback chain: maxresdefault → sddefault → hqdefault
  const [thumbSrc, setThumbSrc] = useState(
    thumbUrl || `https://i.ytimg.com/vi/${media_id}/maxresdefault.jpg`
  )

  const handleThumbError = useCallback(() => {
    if (thumbSrc.includes('maxresdefault')) {
      setThumbSrc(`https://i.ytimg.com/vi/${media_id}/sddefault.jpg`)
    } else if (thumbSrc.includes('sddefault')) {
      setThumbSrc(`https://i.ytimg.com/vi/${media_id}/hqdefault.jpg`)
    }
  }, [thumbSrc, media_id])

  const iframeSrc = `https://www.youtube.com/embed/${media_id}?autoplay=1&enablejsapi=1&modestbranding=1&playsinline=1&rel=0&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`

  // Listen for YouTube postMessage — scoped to this iframe
  useEffect(() => {
    if (ytState !== 'loading') return

    const handler = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return
      // Scope to our iframe by checking source window
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return

      gotAnyMessage.current = true

      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        // YouTube sends onStateChange with info: 1 = PLAYING
        if (data?.event === 'onStateChange' && data?.info === 1) {
          setYtState('playing')
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
        // info: 2 = PAUSED (user paused via YouTube controls)
        if (data?.event === 'onStateChange' && data?.info === 2) {
          // Keep in playing state — don't revert facade
        }
      } catch {
        // Not JSON or not YouTube format — ignore
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [ytState])

  // Timeout: if no PLAYING confirmation, mark failed
  // Start with 3s. If we got any YouTube message (onReady etc), extend to 5s.
  useEffect(() => {
    if (ytState !== 'loading') return

    timeoutRef.current = setTimeout(() => {
      // If we heard from YouTube at all, give it more time
      if (gotAnyMessage.current) {
        timeoutRef.current = setTimeout(() => {
          setYtState(prev => prev === 'loading' ? 'failed' : prev)
        }, 2000) // extra 2s (total 5s)
      } else {
        // Dead silent iframe — very suspicious
        setYtState('failed')
      }
    }, 3000)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [ytState])

  // Reset state when paused by another tile
  useEffect(() => {
    if (!isPlaying && ytState !== 'idle') {
      setYtState('idle')
      gotAnyMessage.current = false
    }
  }, [isPlaying, ytState])

  const handleClick = useCallback(() => {
    if (ytState === 'idle') {
      onPlay()
      setYtState('loading')
      gotAnyMessage.current = false
    } else if (ytState === 'playing') {
      onToggle()
    } else if (ytState === 'failed') {
      // On failed state, clicking the tile itself does nothing —
      // the "Watch on YouTube" link handles navigation
    }
  }, [ytState, onPlay, onToggle])

  return (
    <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
      {/* Sharp full-bleed thumbnail — always in DOM, the movie poster */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbSrc}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        onError={handleThumbError}
      />

      {/* Dark gradient for text readability */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.5) 100%)' }}
      />

      {/* Facade overlay — visible in idle, loading, failed states */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer"
        style={{
          opacity: ytState === 'playing' ? 0 : 1,
          pointerEvents: ytState === 'playing' ? 'none' : 'auto',
          transition: 'opacity 0.3s ease',
          zIndex: 3,
        }}
        onClick={handleClick}
      >
        {ytState === 'idle' && <PlayIcon />}
        {ytState === 'loading' && <LoadingSpinner />}
        {ytState === 'failed' && (
          <a
            href={`https://www.youtube.com/watch?v=${media_id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.18)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)' }}
          >
            <svg className="w-3.5 h-3.5" fill="rgba(255, 255, 255, 0.7)" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.02em',
              }}
            >
              Watch on YouTube
            </span>
          </a>
        )}
        {ytState !== 'failed' && <TitleBlock title={title} artist={artist} />}
      </div>

      {/* YouTube iframe — mounts on click, lives behind facade until confirmed */}
      {(ytState === 'loading' || ytState === 'playing') && (
        <div
          className="absolute inset-0"
          style={{
            opacity: ytState === 'playing' ? 1 : 0,
            transition: 'opacity 0.3s ease',
            zIndex: 2,
          }}
        >
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="w-full h-full"
            style={{ border: 'none' }}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════

function ThumbnailBg({ src }: { src: string | null }) {
  if (!src) return (
    <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.6)' }} />
  )
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'blur(20px) brightness(0.3)', transform: 'scale(1.1)' }}
        loading="lazy"
        decoding="async"
      />
    </>
  )
}

function PlayIcon() {
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'all 0.25s ease',
      }}
    >
      <svg className="w-5 h-5 ml-0.5" fill="rgba(255, 255, 255, 0.9)" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderTopColor: 'rgba(255, 255, 255, 0.8)',
        }}
      />
    </div>
  )
}

function TitleBlock({ title, artist }: { title?: string; artist?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 max-w-full">
      {title && (
        <p
          className="truncate max-w-full text-center"
          style={{
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.6)',
            lineHeight: 1.3,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {title}
        </p>
      )}
      {artist && (
        <p
          className="truncate max-w-full text-center"
          style={{
            fontSize: '9px',
            color: 'rgba(255, 255, 255, 0.25)',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {artist}
        </p>
      )}
    </div>
  )
}

// ── Waveform animation bars ──

const barKeyframes = `
@keyframes ghost-wave-1 { 0%, 100% { height: 20%; } 50% { height: 80%; } }
@keyframes ghost-wave-2 { 0%, 100% { height: 40%; } 50% { height: 60%; } }
@keyframes ghost-wave-3 { 0%, 100% { height: 60%; } 50% { height: 30%; } }
@keyframes ghost-wave-4 { 0%, 100% { height: 30%; } 50% { height: 90%; } }
@keyframes ghost-wave-5 { 0%, 100% { height: 50%; } 50% { height: 40%; } }
`

function WaveformBars() {
  const bars = [
    { animation: 'ghost-wave-1 1.2s ease-in-out infinite', delay: '0s' },
    { animation: 'ghost-wave-2 1.0s ease-in-out infinite', delay: '0.1s' },
    { animation: 'ghost-wave-3 0.8s ease-in-out infinite', delay: '0.2s' },
    { animation: 'ghost-wave-4 1.1s ease-in-out infinite', delay: '0.15s' },
    { animation: 'ghost-wave-5 0.9s ease-in-out infinite', delay: '0.05s' },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: barKeyframes }} />
      <div className="flex items-end gap-[3px]" style={{ height: 24 }}>
        {bars.map((bar, i) => (
          <div
            key={i}
            style={{
              width: 3,
              borderRadius: 1,
              background: 'rgba(255, 255, 255, 0.3)',
              animation: bar.animation,
              animationDelay: bar.delay,
            }}
          />
        ))}
      </div>
    </>
  )
}
