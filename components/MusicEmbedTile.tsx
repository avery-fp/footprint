'use client'

import { useEffect, useState } from 'react'
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

const playerAllow = (provider: MusicProvider) =>
  provider === 'spotify'
    ? 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
    : 'autoplay *; encrypted-media *; fullscreen *'

export default function MusicEmbedTile({
  url,
  provider,
  title,
  artist,
  image,
  displayMode,
}: MusicEmbedTileProps) {
  const [playerOpen, setPlayerOpen] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const embed = parseEmbed(url)
  const showArtwork = !!image && !imgFailed

  if (!embed) {
    return <MusicFacade provider={provider} title={title} artist={artist} image={image} displayMode={displayMode} onImageError={() => setImgFailed(true)} />
  }

  if (displayMode === 'player') {
    if (playerOpen) {
      return (
        <MusicIframe
          src={embed.embedUrl}
          provider={provider}
          title={title}
        />
      )
    }
    return (
      <MusicFacade
        provider={provider}
        title={title}
        artist={artist}
        image={image}
        displayMode="player"
        onPlay={() => setPlayerOpen(true)}
        onImageError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <>
      <MusicFacade
        provider={provider}
        title={title}
        artist={artist}
        image={showArtwork ? image : null}
        displayMode="cover"
        onPlay={() => setPlayerOpen(true)}
        onImageError={() => setImgFailed(true)}
      />
      {playerOpen && (
        <MusicPlayerOverlay
          src={embed.embedUrl}
          provider={provider}
          title={title}
          onClose={() => setPlayerOpen(false)}
        />
      )}
    </>
  )
}

function MusicFacade({
  provider,
  title,
  artist,
  image,
  displayMode,
  onPlay,
  onImageError,
}: {
  provider: MusicProvider
  title: string
  artist?: string
  image?: string | null
  displayMode: MusicDisplayMode
  onPlay?: () => void
  onImageError?: () => void
}) {
  const providerLabel = provider === 'spotify' ? 'Spotify' : 'Apple Music'
  const showArtwork = !!image

  if (displayMode === 'cover') {
    return (
      <button
        type="button"
        className="group relative block h-full w-full overflow-hidden fp-tile text-left"
        style={{ borderRadius: 'inherit', background: 'rgba(255,255,255,0.06)' }}
        onClick={onPlay}
        aria-label={`Play ${title}`}
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
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <PlayIcon />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <MusicMeta title={title} artist={artist} align="center" />
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      className="group relative flex h-full w-full items-center gap-4 overflow-hidden px-3 py-3 text-left fp-tile"
      style={MUSIC_SHELL_STYLE}
      onClick={onPlay}
      aria-label={`Play ${title}`}
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
      <div className="flex h-full shrink-0 items-center gap-4 pr-1">
        <ProviderMark provider={provider} />
        <PlayIcon compact />
      </div>
    </button>
  )
}

function MusicIframe({
  src,
  provider,
  title,
}: {
  src: string
  provider: MusicProvider
  title: string
}) {
  return (
    <div className="relative h-full w-full overflow-hidden fp-tile" style={MUSIC_SHELL_STYLE}>
      <iframe
        src={src}
        title={title}
        className="h-full w-full"
        style={{ border: 0, borderRadius: 'inherit', colorScheme: provider === 'apple_music' ? 'normal' : undefined }}
        allow={playerAllow(provider)}
        sandbox={provider === 'apple_music' ? 'allow-forms allow-scripts allow-same-origin allow-popups' : undefined}
        loading="lazy"
      />
    </div>
  )
}

function MusicPlayerOverlay({
  src,
  provider,
  title,
  onClose,
}: {
  src: string
  provider: MusicProvider
  title: string
  onClose: () => void
}) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2147483646] flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.58)',
        backdropFilter: 'blur(20px) brightness(0.55)',
        WebkitBackdropFilter: 'blur(20px) brightness(0.55)',
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full overflow-hidden rounded-2xl"
        style={{ maxWidth: 560, height: provider === 'spotify' ? 152 : 175 }}
        onClick={(e) => e.stopPropagation()}
      >
        <MusicIframe src={src} provider={provider} title={title} />
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white/90"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
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

function PlayIcon({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{
        width: compact ? 30 : 44,
        height: compact ? 30 : 44,
        background: 'rgba(0,0,0,0.38)',
        border: '1px solid rgba(255,255,255,0.16)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <svg width={compact ? 13 : 16} height={compact ? 13 : 16} viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 text-white/90">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  )
}
