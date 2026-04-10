'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'

// ════════════════════════════════════════
// GHOST TILE — de-branded media renderer
//
// Strips platform chrome. Renders under Footprint's aesthetic.
// Three archetypes: audio pipe, embed pipe, visual pipe.
// ════════════════════════════════════════

const GHOST_PAUSE_EVENT = 'ghost-tile-pause'
const YOUTUBE_IFRAME_API_ID = 'youtube-iframe-api'

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, config?: Record<string, unknown>) => YouTubePlayerInstance
      PlayerState?: {
        UNSTARTED: -1
        ENDED: 0
        PLAYING: 1
        PAUSED: 2
        BUFFERING: 3
        CUED: 5
      }
    }
    onYouTubeIframeAPIReady?: (() => void) | undefined
  }
}

interface YouTubePlayerInstance {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getVideoLoadedFraction: () => number
  getPlayerState: () => number
}

let youtubeApiPromise: Promise<NonNullable<Window['YT']>> | null = null

function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API can only load in the browser'))
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve) => {
    const existingHandler = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      existingHandler?.()
      if (window.YT) resolve(window.YT)
    }

    const existingScript = document.getElementById(YOUTUBE_IFRAME_API_ID) as HTMLScriptElement | null
    if (!existingScript) {
      const script = document.createElement('script')
      script.id = YOUTUBE_IFRAME_API_ID
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    }
  })

  return youtubeApiPromise
}

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
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loadedFraction, setLoadedFraction] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(false)
  const tileId = useRef(`ghost-${media_id}-${Math.random().toString(36).slice(2, 6)}`)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const playerRef = useRef<YouTubePlayerInstance | null>(null)
  const syncTimerRef = useRef<number | null>(null)
  const controlsTimerRef = useRef<number | null>(null)
  const isYouTube = platform === 'youtube'

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

  const clearSyncTimer = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearInterval(syncTimerRef.current)
      syncTimerRef.current = null
    }
  }, [])

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current)
      controlsTimerRef.current = null
    }
  }, [])

  const revealControls = useCallback(() => {
    if (!isYouTube || !isPlaying) return
    clearControlsTimer()
    setControlsVisible(true)
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false)
    }, 1800)
  }, [clearControlsTimer, isPlaying, isYouTube])

  const syncPlayerMetrics = useCallback(() => {
    const player = playerRef.current
    if (!player) return

    const nextDuration = player.getDuration() || 0
    const nextTime = Math.min(player.getCurrentTime() || 0, nextDuration || Infinity)
    const nextLoaded = player.getVideoLoadedFraction() || 0
    const nextState = player.getPlayerState()

    setDuration(nextDuration)
    setCurrentTime(nextTime)
    setLoadedFraction(nextLoaded)
    setIsPaused(nextState === 2 || nextState === 5)
  }, [])

  const startSyncTimer = useCallback(() => {
    clearSyncTimer()
    syncTimerRef.current = window.setInterval(syncPlayerMetrics, 250)
  }, [clearSyncTimer, syncPlayerMetrics])

  const handlePlay = useCallback(() => {
    // Pause all other ghost tiles
    window.dispatchEvent(new CustomEvent(GHOST_PAUSE_EVENT, { detail: { except: tileId.current } }))
    setIsPlaying(true)
    setIsPaused(false)
    setControlsVisible(true)
    onPlay?.()
  }, [onPlay])

  const handleToggle = useCallback(() => {
    if (playerRef.current && isYouTube) {
      revealControls()
      if (isPaused) {
        playerRef.current.playVideo()
        setIsPaused(false)
      } else {
        playerRef.current.pauseVideo()
        setIsPaused(true)
      }
      return
    }

    if (isPlaying) {
      setIsPlaying(false)
    } else {
      handlePlay()
    }
  }, [handlePlay, isPaused, isPlaying, isYouTube, revealControls])

  const handleHide = useCallback(() => {
    clearControlsTimer()
    setIsPlaying(false)
    setControlsVisible(false)
  }, [clearControlsTimer])

  const handleSkip = useCallback((delta: number) => {
    const player = playerRef.current
    if (!player) return
    revealControls()
    const next = Math.max(0, Math.min(duration || 0, (player.getCurrentTime() || 0) + delta))
    player.seekTo(next, true)
    setCurrentTime(next)
  }, [duration, revealControls])

  const handleSeek = useCallback((seconds: number) => {
    const player = playerRef.current
    if (!player) return
    revealControls()
    player.seekTo(seconds, true)
    setCurrentTime(seconds)
  }, [revealControls])

  useEffect(() => {
    if (!isYouTube) return
    if (!isPlaying) {
      clearSyncTimer()
      clearControlsTimer()
      playerRef.current?.destroy()
      playerRef.current = null
      setIframeLoaded(false)
      setCurrentTime(0)
      setDuration(0)
      setLoadedFraction(0)
      setIsPaused(false)
      setControlsVisible(false)
      return
    }

    let cancelled = false

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !iframeRef.current) return

        const player = new YT.Player(iframeRef.current, {
          events: {
            onReady: () => {
              if (cancelled) return
              playerRef.current = player
              setIframeLoaded(true)
              player.playVideo()
              syncPlayerMetrics()
              startSyncTimer()
              revealControls()
            },
            onStateChange: (event: { data: number }) => {
              if (cancelled) return
              if (event.data === 0) {
                setCurrentTime(player.getDuration() || 0)
                setIsPaused(true)
                setControlsVisible(true)
                clearControlsTimer()
              } else if (event.data === 1) {
                setIsPaused(false)
                revealControls()
              } else if (event.data === 2 || event.data === 5) {
                setIsPaused(true)
                setControlsVisible(true)
                clearControlsTimer()
              }
              syncPlayerMetrics()
            },
          },
        })

        playerRef.current = player
      })
      .catch(() => {
        setIframeLoaded(true)
      })

    return () => {
      cancelled = true
      clearSyncTimer()
      clearControlsTimer()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [clearControlsTimer, clearSyncTimer, isPlaying, isYouTube, revealControls, startSyncTimer, syncPlayerMetrics])

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
    ? `https://www.youtube-nocookie.com/embed/${media_id}?autoplay=1&enablejsapi=1&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&fs=0&disablekb=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`
    : platform === 'vimeo'
    ? `https://player.vimeo.com/video/${media_id}?title=0&byline=0&portrait=0&autoplay=1`
    : undefined

  return (
    <div
      className="w-full h-full relative overflow-hidden fp-tile"
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}
    >
      {/* Blurred thumbnail bg */}
      <ThumbnailBg src={thumbUrl} />

      {/* Glass overlay + play button — visible when not playing */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          cursor: 'pointer',
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
            position: 'absolute',
            inset: 0,
            opacity: iframeLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
            zIndex: 1,
          }}
        >
          <iframe
            ref={iframeRef}
            id={`ghost-youtube-${media_id}`}
            src={iframeSrc}
            className="w-full h-full"
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            referrerPolicy="no-referrer"
            loading="lazy"
            onLoad={() => { if (!isYouTube) setIframeLoaded(true) }}
          />
        </div>
      )}

      {isPlaying && isYouTube && (
        <button
          type="button"
          className="absolute inset-0 z-[2]"
          onClick={() => {
            if (controlsVisible) {
              clearControlsTimer()
              setControlsVisible(false)
            } else {
              revealControls()
            }
          }}
          aria-label={controlsVisible ? 'Hide video controls' : 'Show video controls'}
          style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'transparent' }}
        />
      )}

      {isPlaying && isYouTube && (
        <button
          type="button"
          className="absolute right-3 top-3 z-[4] inline-flex min-h-[40px] items-center justify-center rounded-full px-3 text-[10px] uppercase tracking-[0.16em] text-white/76 transition"
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            zIndex: 4,
            display: 'inline-flex',
            minHeight: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 9999,
            paddingInline: 12,
            color: 'rgba(255,255,255,0.76)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            background: 'rgba(0, 0, 0, 0.34)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
          onClick={handleHide}
          aria-label="Hide video"
        >
          <span className="inline-flex items-center gap-1.5">
            <PauseIcon />
            hide
          </span>
        </button>
      )}

      {isPlaying && isYouTube && (
        <div
          className="absolute inset-x-0 bottom-0 z-[4] px-3 pb-3 transition-opacity duration-300"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 4,
            padding: '0 12px 12px',
            opacity: controlsVisible ? 1 : 0,
            pointerEvents: controlsVisible ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
          }}
        >
          <div
            className="rounded-[22px] px-3 py-2.5"
            style={{
              borderRadius: 22,
              padding: '10px 12px',
              background: 'linear-gradient(180deg, rgba(16,16,16,0.48), rgba(8,8,8,0.72))',
              backdropFilter: 'blur(18px) saturate(140%)',
              WebkitBackdropFilter: 'blur(18px) saturate(140%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
              pointerEvents: 'auto',
            }}
          >
            <div
              className="flex items-center gap-2"
              onPointerDown={revealControls}
              onPointerMove={revealControls}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <ControlButton label="Back 10 seconds" onClick={() => handleSkip(-10)}>
                <SkipBackIcon />
              </ControlButton>
              <ControlButton label={isPaused ? 'Play video' : 'Pause video'} onClick={handleToggle}>
                {isPaused ? <PlayGlyph /> : <PauseIcon />}
              </ControlButton>
              <ControlButton label="Forward 10 seconds" onClick={() => handleSkip(10)}>
                <SkipForwardIcon />
              </ControlButton>

              <div className="min-w-0 flex-1" style={{ minWidth: 0, flex: 1 }}>
                <div
                  className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-white/45"
                  style={{
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'rgba(255,255,255,0.45)',
                  }}
                >
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="relative" style={{ position: 'relative' }}>
                  <div className="h-[3px] rounded-full bg-white/10" style={{ height: 3, borderRadius: 9999, background: 'rgba(255,255,255,0.1)' }} />
                  <div
                    className="absolute left-0 top-0 h-[3px] rounded-full bg-white/20"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: 3,
                      borderRadius: 9999,
                      background: 'rgba(255,255,255,0.2)',
                      width: `${Math.max(0, Math.min(100, loadedFraction * 100))}%`,
                    }}
                  />
                  <div
                    className="absolute left-0 top-0 h-[3px] rounded-full bg-[#f5d7b2]"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: 3,
                      borderRadius: 9999,
                      background: '#f5d7b2',
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={Math.min(currentTime, duration || currentTime)}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    onPointerDown={revealControls}
                    className="artifact-range absolute inset-0 h-[14px] w-full -translate-y-[5px] cursor-pointer appearance-none bg-transparent"
                    aria-label="Seek video"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      height: 14,
                      width: '100%',
                      transform: 'translateY(-5px)',
                      cursor: 'pointer',
                      appearance: 'none',
                      background: 'transparent',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
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
    <div className="absolute inset-0" style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)' }} />
  )
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px) brightness(0.3)', transform: 'scale(1.1)' }}
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
        width: 40,
        height: 40,
        borderRadius: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transition: 'all 0.25s ease',
      }}
    >
      <svg className="w-4 h-4 ml-0.5" fill="rgba(255, 255, 255, 0.4)" viewBox="0 0 24 24" style={{ width: 16, height: 16, marginLeft: 2 }}>
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  )
}

function PauseIcon() {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 12, height: 12 }}>
      <path d="M7 5h3v14H7zm7 0h3v14h-3z" />
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 12, height: 12, marginLeft: 2 }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function SkipBackIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14 }}>
      <path d="M11 18V6L2.5 12 11 18zm.5-6 8.5 6V6l-8.5 6z" />
    </svg>
  )
}

function SkipForwardIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14 }}>
      <path d="m13 6 8.5 6-8.5 6V6zm-9 0 8.5 6L4 18V6z" />
    </svg>
  )
}

function ControlButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/78 transition hover:text-white"
      style={{
        display: 'flex',
        height: 32,
        width: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9999,
        color: 'rgba(255,255,255,0.78)',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {children}
    </button>
  )
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  const mins = Math.floor(wholeSeconds / 60)
  const secs = wholeSeconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function TitleBlock({ title, artist }: { title?: string; artist?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 max-w-full" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingInline: 16, maxWidth: '100%' }}>
      {title && (
        <p
          className="truncate max-w-full text-center"
          style={{
            margin: 0,
            maxWidth: '100%',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
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
            margin: 0,
            maxWidth: '100%',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
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
