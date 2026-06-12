'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { audioManager } from '@/lib/audio-manager'
import { parseEmbed } from '@/lib/parseEmbed'

type MusicProvider = 'spotify' | 'apple_music'
type MusicDisplayMode = 'cover' | 'player'

interface MusicEmbedTileProps {
  url: string
  provider: MusicProvider
  title: string
  artist?: string
  image?: string | null
  displayMode: MusicDisplayMode
}

const MUSIC_SHELL_STYLE: React.CSSProperties = {
  borderRadius: 'inherit',
  background: 'rgba(255,255,255,0.08)',
  backdropFilter: 'blur(24px) saturate(150%)',
  WebkitBackdropFilter: 'blur(24px) saturate(150%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(255,255,255,0.12), 0 18px 42px rgba(0,0,0,0.28)',
}

type PreviewResolution = { previewUrl: string | null }

type PreviewCacheEntry = {
  value: PreviewResolution
  expiresAt: number | null
}

const PREVIEW_MISS_TTL_MS = 1000 * 60 * 5
const previewResolutionCache = new Map<string, PreviewCacheEntry>()
const previewResolutionInflight = new Map<string, Promise<PreviewResolution>>()

function normalizePreviewInput(value: string | null | undefined) {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizePreviewUrl(value: string) {
  const trimmed = value.trim()
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    parsed.searchParams.sort()
    return parsed.toString().toLowerCase()
  } catch {
    return normalizePreviewInput(trimmed)
  }
}

function previewResolutionKey({
  url,
  artist,
  title,
}: {
  url: string
  artist?: string
  title: string
}) {
  return [
    normalizePreviewUrl(url),
    normalizePreviewInput(artist),
    normalizePreviewInput(title),
  ].join('|')
}

async function resolveMusicPreviewOnce({
  key,
  url,
  artist,
  title,
}: {
  key: string
  url: string
  artist?: string
  title: string
}) {
  const cached = previewResolutionCache.get(key)
  if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) {
    return cached.value
  }
  if (cached?.expiresAt && cached.expiresAt <= Date.now()) {
    previewResolutionCache.delete(key)
  }

  const inflight = previewResolutionInflight.get(key)
  if (inflight) return inflight

  const promise = fetch('/api/music/resolve-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist: artist || '', title, url }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`resolve-preview failed: ${res.status}`)
      const data = (await res.json()) as { previewUrl?: string | null }
      const value = { previewUrl: data.previewUrl || null }
      previewResolutionCache.set(key, {
        value,
        expiresAt: value.previewUrl ? null : Date.now() + PREVIEW_MISS_TTL_MS,
      })
      return value
    })
    .finally(() => {
      previewResolutionInflight.delete(key)
    })

  previewResolutionInflight.set(key, promise)
  return promise
}

function getAppleMusicTrackId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const trackId = parsed.searchParams.get('i')
    if (trackId) return trackId
    const pathMatch = parsed.pathname.match(/\/(\d+)(?:\/)?$/)
    return pathMatch?.[1] || null
  } catch {
    return null
  }
}

function supportsCompactAppleMusicBar(url: string): boolean {
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/(album|playlist|song|station|music-video)\//i)
    const contentType = match?.[1]?.toLowerCase()
    if (!contentType) return false
    if (contentType === 'song' || contentType === 'music-video') return true
    return contentType === 'album' && parsed.searchParams.has('i')
  } catch {
    return false
  }
}

export default function MusicEmbedTile({
  url,
  provider,
  title,
  artist,
  image,
  displayMode,
}: MusicEmbedTileProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const embed = parseEmbed(url)
  const showArtwork = !!image && !imgFailed
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        audioManager.silenceNativeMedia(previewAudioRef.current, true)
        previewAudioRef.current = null
      }
    }
  }, [])

  const tileIdRef = useRef(`music-${Math.random().toString(36).slice(2, 10)}`)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewPlayingRef = useRef(false)
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string | null>(null)
  const [previewResolved, setPreviewResolved] = useState(false)
  const [spotifyEmbedActive, setSpotifyEmbedActive] = useState(() => provider === 'spotify')
  const [spotifyEmbedWarming, setSpotifyEmbedWarming] = useState(false)
  const [spotifyEmbedReady, setSpotifyEmbedReady] = useState(false)
  const spotifyTapPendingRef = useRef(false)
  useEffect(() => {
    if (provider === 'spotify') setSpotifyEmbedActive(true)
  }, [provider])


  const stopPlayback = useCallback(() => {
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    const id = tileIdRef.current
    audioManager.register(id, stopPlayback)
    return () => {
      audioManager.release(id)
      audioManager.unregister(id)
    }
  }, [stopPlayback])

  if (!embed) {
    return <MusicFacade provider={provider} title={title} artist={artist} image={image} displayMode={displayMode} onImageError={() => setImgFailed(true)} />
  }

  useEffect(() => {
    let cancelled = false
    const key = previewResolutionKey({ url, artist, title })

    async function resolvePreview() {
      try {
        const data = await resolveMusicPreviewOnce({ key, url, artist, title })
        if (cancelled) return

        const nextPreviewUrl = data.previewUrl || null
        setResolvedPreviewUrl(nextPreviewUrl)

        if (previewAudioRef.current) {
          audioManager.silenceNativeMedia(previewAudioRef.current, true)
          previewAudioRef.current = null
        }

        if (nextPreviewUrl) {
          const audio = new Audio(nextPreviewUrl)
          audio.preload = 'auto'
          audio.addEventListener('play', () => {
            previewPlayingRef.current = true
            setIsPlaying(true)
          })
          audio.addEventListener('pause', () => {
            previewPlayingRef.current = false
            setIsPlaying(false)
          })
          audio.addEventListener('ended', () => {
            previewPlayingRef.current = false
            setIsPlaying(false)
          })
          previewAudioRef.current = audio
          if (spotifyTapPendingRef.current) {
            spotifyTapPendingRef.current = false
            setSpotifyEmbedWarming(false)
            setSpotifyEmbedActive(false)
            audioManager.playNative(tileIdRef.current, audio)
            void audio.play().catch(() => setIsPlaying(false))
          }
        } else if (spotifyTapPendingRef.current) {
          spotifyTapPendingRef.current = false
          setSpotifyEmbedActive(true)
          setIsPlaying(true)
        }

        setPreviewResolved(true)
      } catch {
        if (!cancelled) {
          setResolvedPreviewUrl(null)
          if (spotifyTapPendingRef.current) {
            spotifyTapPendingRef.current = false
            setSpotifyEmbedActive(true)
            setIsPlaying(true)
          }
          setPreviewResolved(true)
        }
      }
    }

    resolvePreview()

    return () => {
      cancelled = true
    }
  }, [artist, title, url])

  useEffect(() => {
    const handlePreviewAudioClaim = (event: Event) => {
      const claimedId = (event as CustomEvent<{ id?: string }>).detail?.id
      if (claimedId !== tileIdRef.current) {
        previewPlayingRef.current = false
        setIsPlaying(false)
      }
    }

    window.addEventListener('audio-claim', handlePreviewAudioClaim)
    return () => window.removeEventListener('audio-claim', handlePreviewAudioClaim)
  }, [])

  const handleCoverActivate = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (previewPlayingRef.current && previewAudioRef.current) {
      audioManager.stopNativePreview(tileIdRef.current)
      previewPlayingRef.current = false
      setIsPlaying(false)
      return
    }

    if (provider === 'spotify') {
      window.location.href = url
      return
    }

    if (!previewResolved) {
      return
    }

    if (!resolvedPreviewUrl || !previewAudioRef.current) {
      window.location.href = url
      return
    }

    const audio = previewAudioRef.current
    audioManager.playNativePreview(tileIdRef.current, audio)
    previewPlayingRef.current = true
    setIsPlaying(true)
  }, [previewResolved, resolvedPreviewUrl, url])

  if (displayMode === 'player') {
    if (provider === 'spotify') {
      return (
        <MusicSurface
          url={url}
          provider={provider}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
          tileId={tileIdRef.current}
          spotifyPreviewAudio={previewAudioRef.current}
          spotifyPreviewResolved={previewResolved}
          onSpotifyEmbedFallback={() => {}}
          onSpotifyEmbedWarm={() => {}}
        >
          <MusicFacade
            provider={provider}
            title={title}
            artist={artist}
            image={showArtwork ? image : null}
            displayMode="player"
            isPlaying={isPlaying}
            onImageError={() => setImgFailed(true)}
          />
        </MusicSurface>
      )
    }
    if (provider === 'apple_music' && supportsCompactAppleMusicBar(url)) {
      return <NativeMusicBar src={embed.embedUrl} title={title} provider={provider} />
    }
    return (
      <MusicSurface
        url={url}
        provider={provider}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
        tileId={tileIdRef.current}
      >
        <MusicFacade
          provider={provider}
          title={title}
          artist={artist}
          image={showArtwork ? image : null}
          displayMode="player"
          isPlaying={isPlaying}
          onImageError={() => setImgFailed(true)}
        />
      </MusicSurface>
    )
  }

  return (
    <MusicFacade
      provider={provider}
      title={title}
      artist={artist}
      image={showArtwork ? image : null}
      displayMode="cover"
      href={url}
      onClick={handleCoverActivate}
      isPlaying={isPlaying}
      onImageError={() => setImgFailed(true)}
    />
  )
}

function NativeMusicBar({
  src,
  title,
  provider,
  audioId,
  loading = 'lazy',
  onReady,
}: {
  src: string
  title: string
  provider: MusicProvider
  audioId?: string
  loading?: 'eager' | 'lazy'
  onReady?: () => void
}) {
  const audioIdRef = useRef(audioId ?? `music-native-${provider}-${src}`)

  return (
    <div className="relative h-full w-full overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
      <iframe
        data-music-iframe="true"
        data-audio-id={audioIdRef.current}
        src={src}
        title={title}
        className="block h-full w-full fp-tile"
        style={{
          border: 0,
          borderRadius: 'inherit',
        }}
        scrolling="no"
        allow={provider === 'spotify'
          ? 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
          : 'autoplay *; encrypted-media *; fullscreen *'}
        sandbox={provider === 'apple_music' ? 'allow-forms allow-scripts allow-same-origin allow-popups' : undefined}
        loading={loading}
        onLoad={onReady}
      />
      {provider === 'spotify' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{ background: '#202020' }}
        />
      )}
    </div>
  )
}

function SpotifyInlineDissolve({
  src,
  title,
  audioId,
  ready,
  onReady,
  children,
}: {
  src: string
  title: string
  audioId: string
  ready: boolean
  onReady: () => void
  children: ReactNode
}) {
  return (
    <div className="relative h-full w-full overflow-hidden fp-tile" style={{ borderRadius: 'inherit' }}>
      <div
        className="absolute inset-0"
        style={{
          opacity: ready ? 1 : 0,
          transition: 'opacity 260ms ease-out',
          zIndex: 1,
        }}
      >
        <NativeMusicBar
          src={src}
          title={title}
          provider="spotify"
          audioId={audioId}
          loading="eager"
          onReady={onReady}
        />
      </div>
      <div
        className="absolute inset-0"
        style={{
          opacity: ready ? 0 : 1,
          transition: 'opacity 260ms ease-out',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function MusicSurface({
  url,
  provider,
  isPlaying,
  onPlayingChange,
  tileId,
  spotifyPreviewAudio,
  spotifyPreviewResolved = false,
  onSpotifyEmbedFallback,
  onSpotifyEmbedWarm,
  children,
}: {
  url: string
  provider: MusicProvider
  isPlaying: boolean
  onPlayingChange: (next: boolean) => void
  tileId: string
  spotifyPreviewAudio?: HTMLAudioElement | null
  spotifyPreviewResolved?: boolean
  onSpotifyEmbedFallback?: () => void
  onSpotifyEmbedWarm?: () => void
  children: ReactNode
}) {
  const appleAudioRef = useRef<HTMLAudioElement | null>(null)
  const pendingPlayRef = useRef(false)
  const setPlaybackState = useCallback((next: boolean) => {
    onPlayingChange(next)
    if (!next) audioManager.release(tileId)
  }, [onPlayingChange, tileId])

  useEffect(() => {
    if (provider !== 'apple_music') return
    const trackId = getAppleMusicTrackId(url)
    if (!trackId) return
    let active = true
    fetch(`/api/apple-preview?id=${trackId}`)
      .then((res) => res.json())
      .then((data: { previewUrl?: string | null }) => {
        if (!active || !data.previewUrl) return
        const audio = new Audio(data.previewUrl)
        audio.preload = 'auto'
        audio.addEventListener('play', () => setPlaybackState(true))
        audio.addEventListener('pause', () => setPlaybackState(false))
        audio.addEventListener('ended', () => setPlaybackState(false))
        appleAudioRef.current = audio
        if (pendingPlayRef.current) {
          pendingPlayRef.current = false
          audioManager.playNative(tileId, audio)
          void audio.play().catch(() => setPlaybackState(false))
        }
      })
      .catch(() => {})
    return () => {
      active = false
      pendingPlayRef.current = false
      if (appleAudioRef.current) audioManager.silenceNativeMedia(appleAudioRef.current, true)
      audioManager.release(tileId)
      appleAudioRef.current = null
    }
  }, [provider, setPlaybackState, tileId, url])

  useEffect(() => {
    if (provider !== 'spotify') return
    if (!pendingPlayRef.current || !spotifyPreviewResolved) return
    pendingPlayRef.current = false

    if (!spotifyPreviewAudio) {
      audioManager.activateProvider(tileId)
      onPlayingChange(true)
      onSpotifyEmbedFallback?.()
      return
    }

    audioManager.playNative(tileId, spotifyPreviewAudio)
    void spotifyPreviewAudio.play().catch(() => setPlaybackState(false))
  }, [onPlayingChange, provider, setPlaybackState, spotifyPreviewAudio, spotifyPreviewResolved, tileId])

  useEffect(() => {
    if (isPlaying) return
    if (spotifyPreviewAudio) audioManager.silenceNativeMedia(spotifyPreviewAudio, true)
    if (appleAudioRef.current) audioManager.silenceNativeMedia(appleAudioRef.current, true)
  }, [isPlaying, spotifyPreviewAudio])

  const handleToggle = useCallback(() => {
    if (provider === 'spotify') {
      if (!spotifyPreviewResolved) {
        pendingPlayRef.current = true
        audioManager.activateProvider(tileId)
        onPlayingChange(true)
        onSpotifyEmbedWarm?.()
        return
      }

      const audio = spotifyPreviewAudio

      // Spotify only gets to claim native audio if it actually has preview
      // audio. No preview = keep playback inline with the provider embed.
      if (!audio) {
        pendingPlayRef.current = false
        audioManager.activateProvider(tileId)
        onPlayingChange(true)
        onSpotifyEmbedFallback?.()
        return
      }

      audioManager.activateProvider(tileId)

      if (audio.paused) {
        onPlayingChange(true)
        audioManager.playNative(tileId, audio)
        void audio.play().catch(() => setPlaybackState(false))
      } else {
        setPlaybackState(false)
        audioManager.silenceNativeMedia(audio, true)
      }
      return
    }

    if (provider === 'apple_music') audioManager.activateProvider(tileId)
    if (!isPlaying) {
      onPlayingChange(true)
    }

    const audio = appleAudioRef.current
    if (!audio) {
      pendingPlayRef.current = true
      return
    }
    if (audio.paused) {
      audioManager.playNative(tileId, audio)
      void audio.play().catch(() => setPlaybackState(false))
    } else {
      audioManager.release(tileId)
      audioManager.silenceNativeMedia(audio, true)
    }
  }, [isPlaying, onPlayingChange, onSpotifyEmbedFallback, onSpotifyEmbedWarm, provider, setPlaybackState, spotifyPreviewAudio, spotifyPreviewResolved, tileId])

  return (
    <div className="relative h-full w-full" onClick={handleToggle}>
      {children}
    </div>
  )
}

function MusicFacade({
  provider,
  title,
  artist,
  image,
  displayMode,
  isPlaying,
  href,
  onClick,
  onImageError,
}: {
  provider: MusicProvider
  title: string
  artist?: string
  image?: string | null
  displayMode: MusicDisplayMode
  isPlaying?: boolean
  href?: string
  onClick?: (event: React.MouseEvent) => void
  onImageError?: () => void
}) {
  const providerLabel = provider === 'spotify' ? 'Spotify' : 'Apple Music'
  const showArtwork = !!image

  if (displayMode === 'cover') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group relative block h-full w-full overflow-hidden fp-tile text-left"
        style={{ borderRadius: 'inherit', background: 'rgba(255,255,255,0.06)' }}
        aria-label={onClick ? `${isPlaying ? 'Pause' : 'Play'} ${title}` : `Open ${title}`}
        onClick={onClick}
      >
        {showArtwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image!} alt="" className="absolute inset-0 h-full w-full object-cover" onError={onImageError} />
        ) : (
          <FallbackSurface provider={providerLabel} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.24) 52%, rgba(0,0,0,0.08) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <MusicMeta title={title} align="center" />
        </div>
      </a>
    )
  }

  return (
    <button
      type="button"
      className={
        provider === 'spotify'
          ? "group relative flex h-full w-full items-center gap-3 overflow-hidden bg-transparent px-0 py-0 text-left"
          : "group relative flex h-full w-full items-center gap-4 overflow-hidden px-3 py-2.5 text-left fp-tile"
      }
      style={provider === 'spotify' ? { borderRadius: 'inherit' } : MUSIC_SHELL_STYLE}
      aria-label={`${isPlaying ? 'Pause' : 'Play'} ${title}`}
    >
      <div
        className="relative h-full shrink-0 overflow-hidden"
        style={{ aspectRatio: '1 / 1', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}
      >
        {showArtwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image!} alt="" className="h-full w-full object-cover" onError={onImageError} />
        ) : (
          <FallbackSurface provider={providerLabel} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <MusicMeta title={title} artist={artist} align="left" />
      </div>
      {provider !== 'spotify' && (
        <>
          <div className="absolute right-3 top-3">
            <ProviderMark provider={provider} />
          </div>
          <div className="absolute bottom-2.5 right-3 flex shrink-0 items-center gap-3">
            <PlayIcon compact solid={false} playing={isPlaying} />
          </div>
        </>
      )}
    </button>
  )
}

function MusicMeta({
  title,
  artist,
  align,
}: {
  title: string
  artist?: string
  align: 'left' | 'center'
}) {
  return (
    <div className={align === 'center' ? 'text-center' : 'text-left'}>
      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white/90">{title}</p>
      {artist && <p className="mt-0.5 truncate text-[10px] uppercase text-white/45">{artist}</p>}
    </div>
  )
}

function FallbackSurface({ provider }: { provider: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/[0.06]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-white/25">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/30">{provider}</span>
    </div>
  )
}

function ProviderMark({ provider }: { provider: MusicProvider }) {
  if (provider === 'spotify') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white/80" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4.17 13.04a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.1-10.56-1.13a.75.75 0 1 1-.34-1.46c4.58-1.05 8.52-.62 11.68 1.31.35.21.46.67.25 1.03Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.99-8.16-2.57-11.98-1.38a.94.94 0 1 1-.56-1.8c4.37-1.36 9.8-.71 13.52 1.58.44.27.58.85.31 1.29Zm.13-3.4c-3.87-2.3-10.25-2.51-13.95-1.39a1.13 1.13 0 1 1-.65-2.16c4.25-1.29 11.31-1.04 15.76 1.6a1.13 1.13 0 0 1-1.16 1.95Z" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-white/80" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function CircleIcon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center rounded-full"
      style={{ border: '1.5px solid rgba(255,255,255,0.84)' }}
      title={label}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" className="text-white/90">
        {children}
      </svg>
    </span>
  )
}

function MoreIcon() {
  return (
    <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center gap-1 text-white/70">
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
    </span>
  )
}

function PlayIcon({ compact = false, solid = false, playing = false }: { compact?: boolean; solid?: boolean; playing?: boolean }) {
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{
        width: compact ? 30 : 44,
        height: compact ? 30 : 44,
        background: solid ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.38)',
        border: solid ? 'none' : '1px solid rgba(255,255,255,0.16)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <svg
        width={compact ? 13 : 16}
        height={compact ? 13 : 16}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={solid ? 'ml-0.5 text-black/90' : 'ml-0.5 text-white/90'}
      >
        {playing ? <path d="M7 5h4v14H7zm6 0h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
      </svg>
    </span>
  )
}
