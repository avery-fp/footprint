'use client'

/**
 * MUSIC TILE V1 — lock-screen-inspired glass object
 *
 * Artwork full-bleed if valid, else dark glass with source badge.
 * Title + artist. One honest action button: "play →" or "open →".
 * No fake controls. No fake playback state. No raw iframes in resting state.
 */

import { useState } from 'react'

interface MusicTileProps {
  title: string      // pre-sanitized, never empty
  creator: string | null
  image: string | null
  provider: string   // e.g. 'Spotify', 'Apple Music', 'YouTube'
  actionUrl: string
  aspectClass?: string
}

export default function MusicTile({
  title,
  creator,
  image,
  provider,
  actionUrl,
  aspectClass = 'aspect-square',
}: MusicTileProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const showArtwork = !!image && !imgFailed
  const isStreamingService = provider === 'Spotify' || provider === 'Apple Music'

  return (
    <a
      href={actionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full ${aspectClass} fp-tile overflow-hidden relative group`}
      style={
        showArtwork
          ? { background: '#000' }
          : {
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }
      }
    >
      {/* Artwork */}
      {showArtwork && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
          {/* Radial aura at bottom */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 130%, rgba(0,0,0,0.65) 0%, transparent 65%)',
            }}
          />
        </>
      )}

      {/* Source badge when no artwork */}
      {!showArtwork && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-white/20 uppercase tracking-widest font-mono"
            style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.2em' }}
          >
            {provider}
          </span>
        </div>
      )}

      {/* Lock-screen bottom panel */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-4 pt-8"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 65%, transparent 100%)',
        }}
      >
        {/* Subtle aura line */}
        <div
          className="mb-2.5"
          style={{ width: '32px', height: '1px', background: 'rgba(255,255,255,0.18)' }}
        />
        <span
          className="text-white/85 line-clamp-2 text-center fp-text-shadow px-4"
          style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.35 }}
        >
          {title}
        </span>
        {creator && (
          <span
            className="text-white/40 uppercase tracking-widest truncate max-w-full text-center font-mono px-4 mt-0.5"
            style={{ fontSize: '9px', fontWeight: 500, lineHeight: 1.2 }}
          >
            {creator}
          </span>
        )}
        <span
          className="text-white/25 group-hover:text-white/65 transition-colors duration-200 mt-2.5"
          style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}
        >
          {isStreamingService ? 'play →' : 'open →'}
        </span>
      </div>
    </a>
  )
}
