'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ════════════════════════════════════════
// GHOST TILE — de-branded media renderer
//
// Strips platform chrome. Renders under Footprint's aesthetic.
// Three archetypes: audio pipe, embed pipe, visual pipe.
// ════════════════════════════════════════

const GHOST_PAUSE_EVENT = 'ghost-tile-pause'

type Archetype = 'audio' | 'embed' | 'visual'

function getArchetype(platform: string, _url: string): Archetype {
  if (platform === 'spotify') return 'audio'   // audio pipe — hidden iframe, ghost UI is the player
  if (platform === 'soundcloud') return 'audio'
  if (platform === 'vimeo') return 'visual'
  // YouTube default: visual
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
    // Pause all other ghost tiles
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

  // Thumbnail background
  const thumbUrl = thumbnail_url || (
    platform === 'youtube' ? `https://i.ytimg.com/vi/${media_id}/maxresdefault.jpg` : null
  )

  // ════════════════════════════════════════
  // AUDIO PIPE — hidden iframe, custom play UI
  // (YouTube music, SoundCloud)
  // ════════════════════════════════════════
  if (archetype === 'audio') {
    // Build hidden iframe src per platform
    let iframeSrc: string | undefined
    const isSpotify = platform === 'spotify'

    if (platform === 'youtube') {
      iframeSrc = `https://www.youtube-nocookie.com/embed/${media_id}?enablejsapi=1&controls=0&modestbranding=1&playsinline=1&rel=0&autoplay=${isPlaying ? 1 : 0}`
    } else if (isSpotify) {
      // Hidden Spotify embed — autoplay audio, zero chrome
      const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
      const spotifyType = spotifyMatch?.[1] || 'track'
      const spotifyId = spotifyMatch?.[2] || media_id
      iframeSrc = `https://open.spotify.com/embed/${spotifyType}/${spotifyId}?theme=0&autoplay=1`
    }

    return (
      <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
        {/* Spotify: full-bleed album art — the art IS the tile. No blur. Like holding a record.
            YouTube/SoundCloud: blurred thumbnail bg */}
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
            {/* Subtle dark vignette so text reads over bright covers */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.4) 100%)' }} />
          </>
        ) : (
          <ThumbnailBg src={thumbUrl} />
        )}

        {/* Glass overlay — YouTube: full blur. Spotify: transparent (art shows through) */}
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

        {/* Hidden audio iframe */}
        {isPlaying && iframeSrc && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="absolute"
            style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            allow="autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        )}

        {/* Play UI — Spotify: frosted glass button over full-bleed art. YouTube: standard. */}
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

  // (embed pipe removed — Spotify now uses audio pipe above)

  // ════════════════════════════════════════
  // VISUAL PIPE — YouTube video, Vimeo
  // Blurred thumbnail bg + clean play icon
  // On tap: load iframe, fade in
  // ════════════════════════════════════════
  const iframeSrc = platform === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${media_id}?autoplay=1&controls=0&modestbranding=1&playsinline=1&rel=0`
    : platform === 'vimeo'
    ? `https://player.vimeo.com/video/${media_id}?title=0&byline=0&portrait=0&autoplay=1`
    : undefined

  return (
    <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
      {/* Blurred thumbnail bg */}
      <ThumbnailBg src={thumbUrl} />

      {/* Glass overlay + play button — visible when not playing */}
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

      {/* Video iframe — loads on play */}
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
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            referrerPolicy="no-referrer"
            loading="lazy"
            onLoad={() => setIframeLoaded(true)}
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
      className="w-10 h-10 rounded-full flex items-center justify-center"
      style={{
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transition: 'all 0.25s ease',
      }}
    >
      <svg className="w-4 h-4 ml-0.5" fill="rgba(255, 255, 255, 0.4)" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
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
