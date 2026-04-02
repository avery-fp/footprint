'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { audioManager } from '@/lib/audio-manager'
import { parseEmbed } from '@/lib/parseEmbed'

// ════════════════════════════════════════
// GHOST TILE — de-branded media renderer
//
// Strips platform chrome. Renders under Footprint's aesthetic.
// Two archetypes:
//   Audio pipe  — Spotify, SoundCloud: hidden iframe, custom UI
//   Visual pipe — YouTube, Vimeo: blurred bg + iframe reveal on play
// ════════════════════════════════════════

const GHOST_PAUSE_EVENT = 'ghost-tile-pause'

type Archetype = 'audio' | 'visual'

function getArchetype(platform: string, _url: string): Archetype {
  if (platform === 'spotify') return 'audio'
  if (platform === 'soundcloud') return 'audio'
  return 'visual'
}

interface GhostTileProps {
  url: string
  platform: string
  media_id: string
  title?: string
  artist?: string
  thumbnail_url?: string

  onPlay?: () => void
}

export default function GhostTile({
  url,
  platform,
  media_id,
  title,
  artist,
  thumbnail_url,
  onPlay,
}: GhostTileProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const tileId = useRef(`ghost-${media_id}-${Math.random().toString(36).slice(2, 6)}`)


  const archetype = getArchetype(platform, url)

  // Register with global AudioManager so ContentCard tiles also pause
  useEffect(() => {
    const id = tileId.current
    audioManager.register(id, () => {
      setIsPlaying(false)
      setIframeLoaded(false)
    })
    return () => audioManager.unregister(id)
  }, [])

  // Listen for pause events from other ghost tiles
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.except !== tileId.current) {
        setIsPlaying(false)
        setIframeLoaded(false)
      }
    }
    window.addEventListener(GHOST_PAUSE_EVENT, handler)
    return () => window.removeEventListener(GHOST_PAUSE_EVENT, handler)
  }, [])

  const handlePlay = useCallback(() => {
    // Pause other ghost tiles
    window.dispatchEvent(new CustomEvent(GHOST_PAUSE_EVENT, { detail: { except: tileId.current } }))
    // Pause ContentCard tiles via AudioManager
    audioManager.play(tileId.current)
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
  // SPOTIFY — facade → real embed on tap, branding masked
  // ════════════════════════════════════════
  if (platform === 'spotify') {
    const spotifyEmbed = parseEmbed(url)
    const spotifyEmbedSrc = spotifyEmbed?.embedUrl || `https://open.spotify.com/embed/track/${media_id}?utm_source=generator&theme=0`

    // Facade — album art, tap to reveal embed
    if (!isPlaying) {
      return (
        <div
          className="w-full h-full fp-tile overflow-hidden cursor-pointer relative group bg-black"
          style={{ borderRadius: 'inherit' }}
          onClick={handlePlay}
        >
          {thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail_url}
              alt={title || ''}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.04)' }} />
          )}

          {/* Play hint — barely there, appears on hover */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 3, pointerEvents: 'none' }}>
            <div
              className="fp-ghost-play w-7 h-7 rounded-full flex items-center justify-center transition-opacity duration-300"
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
            >
              <svg className="w-2.5 h-2.5 text-white/70 ml-px" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>

          {/* Idle waveform hint */}
          <div
            className="absolute left-0 right-0 flex justify-center"
            style={{ bottom: 12, opacity: 0.15, pointerEvents: 'none', zIndex: 3 }}
          >
            <WaveformBarsIdle />
          </div>
        </div>
      )
    }

    // Activated — real Spotify embed, branding masked with dark overlays
    return (
      <div
        className="w-full h-full fp-tile overflow-hidden relative bg-black"
        style={{ borderRadius: 'inherit' }}
      >
        <iframe
          src={spotifyEmbedSrc}
          className="absolute inset-0 w-full h-full"
          style={{ border: 'none' }}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
        {/* Top mask — covers Spotify logo */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: 28, background: 'linear-gradient(to bottom, black 60%, transparent)', zIndex: 2, pointerEvents: 'none' }}
        />
        {/* Bottom mask — covers "Save on Spotify" / "Open in Spotify" */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: 32, background: 'linear-gradient(to top, black 60%, transparent)', zIndex: 2, pointerEvents: 'none' }}
        />
      </div>
    )
  }

  // ════════════════════════════════════════
  // APPLE MUSIC — 150px transparent compact bar
  // ════════════════════════════════════════
  // OTHER AUDIO — SoundCloud etc: hidden iframe approach
  // ════════════════════════════════════════
  if (archetype === 'audio') {
    return (
      <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
        <ThumbnailBg src={thumbUrl} />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
          style={{ zIndex: 2 }}
          onClick={handleToggle}
        >
          {isPlaying ? <WaveformBars /> : null}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // VISUAL PIPE — YouTube, Vimeo
  // Blurred thumbnail bg + iframe reveal on play
  // ════════════════════════════════════════
  const iframeSrc = platform === 'youtube'
    ? `https://www.youtube.com/embed/${media_id}?autoplay=1&controls=0&rel=0&iv_load_policy=3&playsinline=1`
    : platform === 'vimeo'
    ? `https://player.vimeo.com/video/${media_id}?title=0&byline=0&portrait=0&badge=0&dnt=1&autoplay=1`
    : undefined

  return (
    <div
      className="w-full h-full relative fp-tile group"
      style={{
        borderRadius: 'inherit',
        overflow: 'hidden',
        // clip-path clips cross-origin iframes (overflow:hidden alone doesn't)
        clipPath: 'inset(0 round var(--fp-tile-radius, 0px))',
      }}
    >
      <ThumbnailBg src={thumbUrl} />

      <div
        className="absolute inset-0 flex items-center justify-center cursor-pointer"
        style={{
          opacity: isPlaying ? 0 : 1,
          pointerEvents: isPlaying ? 'none' : 'auto',
          transition: 'opacity 0.4s ease',
          zIndex: 2,
        }}
        onClick={handlePlay}
      >
        <div
          className="fp-ghost-play w-7 h-7 rounded-full flex items-center justify-center transition-opacity duration-300"
          style={{
            background: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <svg className="w-2.5 h-2.5 text-white/70 ml-px" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
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
            src={iframeSrc}
            className="w-full h-full"
            style={{ border: 'none' }}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            onLoad={() => setIframeLoaded(true)}
          />
          {/* Block clicks on YouTube watermark area */}
          {platform === 'youtube' && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 50,
                height: 40,
                zIndex: 2,
                pointerEvents: 'auto',
              }}
            />
          )}
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
        style={{}}
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
@keyframes ghost-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.015); } }
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

function WaveformBarsIdle() {
  const heights = [4, 7, 10, 6, 8]
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 12 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: h,
            borderRadius: 1,
            background: 'rgba(255, 255, 255, 0.5)',
          }}
        />
      ))}
    </div>
  )
}
