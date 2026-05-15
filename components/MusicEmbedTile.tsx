'use client'

import { useState, type ReactNode } from 'react'
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

  if (playerOpen) {
    return <MusicIframe src={embed.embedUrl} provider={provider} title={title} />
  }

  return (
    <MusicFacade
      provider={provider}
      title={title}
      artist={artist}
      image={showArtwork ? image : null}
      displayMode="cover"
      onPlay={() => setPlayerOpen(true)}
      onImageError={() => setImgFailed(true)}
    />
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
      className="group relative flex h-full w-full items-center gap-4 overflow-hidden px-3 py-2.5 text-left fp-tile"
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
        {provider === 'spotify' && (
          <span className="mt-1.5 inline-flex rounded-[2px] bg-white/90 px-1.5 py-0.5 text-[9px] font-medium leading-none text-black/80">
            Preview
          </span>
        )}
      </div>
      <div className="absolute right-3 top-3">
        <ProviderMark provider={provider} />
      </div>
      <div className="absolute bottom-2.5 right-3 flex shrink-0 items-center gap-3">
        {provider === 'spotify' && (
          <>
            <CircleIcon label="Add">
              <path d="M12 5v14M5 12h14" />
            </CircleIcon>
            <MoreIcon />
          </>
        )}
        <PlayIcon compact solid={provider === 'spotify'} />
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
  const isSpotify = provider === 'spotify'

  return (
    <div
      className="relative h-full w-full overflow-hidden fp-tile"
      style={{
        ...MUSIC_SHELL_STYLE,
        background: isSpotify ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)',
      }}
    >
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

function PlayIcon({ compact = false, solid = false }: { compact?: boolean; solid?: boolean }) {
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
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  )
}
