'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { audioManager } from '@/lib/audio-manager'

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
  // SPOTIFY — 80px compact bar
  // ════════════════════════════════════════
  if (platform === 'spotify') {
    const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
    const spotifyType = spotifyMatch?.[1] || 'track'
    const spotifyId = spotifyMatch?.[2] || media_id
    const spotifyEmbedSrc = `https://open.spotify.com/embed/${spotifyType}/${spotifyId}?theme=0`

    return (
      <iframe
        src={spotifyEmbedSrc}
        className="w-full fp-tile"
        style={{
          border: 'none',
          borderRadius: 12,
          height: 80,
          display: 'block',
        }}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    )
  }

  // ════════════════════════════════════════
  // APPLE MUSIC — 150px transparent compact bar
  // Crop: hide header + footer, show album art + title + progress
  // ════════════════════════════════════════
  if (platform === 'applemusic') {
    const embedSrc = url.replace('music.apple.com', 'embed.music.apple.com')
    const [isPlaying, setIsPlaying] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const previewUrlRef = useRef<string | null>(null)
    const tileId = `applemusic-${media_id}`

    // Register with AudioManager for one-sound-at-a-time
    useEffect(() => {
      audioManager.register(tileId, () => {
        audioRef.current?.pause()
        setIsPlaying(false)
      })
      return () => audioManager.unregister(tileId)
    }, [tileId])

    const handleToggle = async () => {
      if (isPlaying) {
        audioRef.current?.pause()
        setIsPlaying(false)
        audioManager.mute(tileId)
        return
      }
      try {
        // Use cached preview URL or fetch from our proxy (no CORS issues)
        if (!previewUrlRef.current) {
          const trackId = media_id || url.match(/[?&]i=(\d+)/)?.[1] || url.match(/\/(\d+)(?:\?|$)/)?.[1]
          if (!trackId) return
          const res = await fetch(`/api/apple-preview?id=${trackId}`)
          const data = await res.json()
          previewUrlRef.current = data.previewUrl
        }
        if (!previewUrlRef.current) return
        if (!audioRef.current) {
          audioRef.current = new Audio()
          audioRef.current.onended = () => {
            setIsPlaying(false)
            audioManager.mute(tileId)
          }
        }
        audioRef.current.src = previewUrlRef.current
        audioRef.current.play()
        setIsPlaying(true)
        audioManager.play(tileId)
      } catch { /* silent — tile stays visual */ }
    }

    return (
      <div
        className="w-full fp-tile"
        onClick={handleToggle}
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          height: 75,
          position: 'relative',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 14px 0 0',
          background: '#fff',
        }}
      >
        {/* Album art */}
        {thumbnail_url && (
          <img
            src={thumbnail_url}
            alt=""
            style={{
              width: 75,
              height: 75,
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        )}
        {/* Title + artist */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
          )}
          {artist && (
            <div style={{ fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {artist}
            </div>
          )}
        </div>
        {/* Play/pause indicator */}
        <div style={{ flexShrink: 0 }}>
          {isPlaying ? (
            <WaveformBars />
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#1a1a1a">
              <path d="M6 3.5l11 6.5-11 6.5V3.5z"/>
            </svg>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // OTHER AUDIO — SoundCloud etc: hidden iframe approach
  // ════════════════════════════════════════
  if (archetype === 'audio') {
    return (
      <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
        <ThumbnailBg src={thumbUrl} />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6) 100%)',
            transition: 'background 0.25s ease',
          }}
        />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer"
          style={{ zIndex: 2 }}
          onClick={handleToggle}
        >
          {isPlaying ? <WaveformBars /> : null}
          <TitleBlock title={title} artist={artist} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // VISUAL PIPE — YouTube, Vimeo
  // Blurred thumbnail bg + iframe reveal on play
  // ════════════════════════════════════════
  const iframeSrc = platform === 'youtube'
    ? `https://www.youtube.com/embed/${media_id}?autoplay=1&modestbranding=1&playsinline=1&rel=0`
    : platform === 'vimeo'
    ? `https://player.vimeo.com/video/${media_id}?title=0&byline=0&portrait=0&autoplay=1`
    : undefined

  return (
    <div className="w-full h-full relative overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
      <ThumbnailBg src={thumbUrl} />

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer"
        style={{
          background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.5) 100%)',
          opacity: isPlaying ? 0 : 1,
          pointerEvents: isPlaying ? 'none' : 'auto',
          transition: 'opacity 0.25s ease',
          zIndex: 2,
        }}
        onClick={handlePlay}
      >
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
        style={{ filter: 'brightness(0.85)' }}
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
