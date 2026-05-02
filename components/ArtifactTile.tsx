'use client'

/**
 * ARTIFACT TILE — dignified object for any external URL
 *
 * Two layout paths:
 *   image-backed  → full-bleed photo, gradient, bottom-anchored text
 *   text-only     → centered owner label, quiet source footer, no void
 *
 * Owner title is always the headline. Source/domain stays quiet underneath.
 * No broken image placeholders. No raw iframes. No undefined labels.
 */

import { useState } from 'react'

interface ArtifactTileProps {
  title: string      // pre-sanitized, never empty — owner label when set
  provider: string   // pre-sanitized, never empty — source stays quiet
  image: string | null
  description: string | null
  actionUrl: string
  aspectClass?: string
}

export default function ArtifactTile({
  title,
  provider,
  image,
  description,
  actionUrl,
  aspectClass = 'aspect-square',
}: ArtifactTileProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!image && !imgFailed
  // Suppress provider label when it's the same string as the title
  // (happens when no OG title — provider name becomes the title).
  const showProvider = provider !== title

  return (
    <a
      href={actionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full ${aspectClass} fp-tile overflow-hidden relative group`}
      style={
        showImage
          ? { background: '#000' }
          : {
              background: 'rgba(255,255,255,0.09)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }
      }
    >
      {showImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)',
            }}
          />
        </>
      )}

      {showImage ? (
        /* ── Image-backed: bottom-anchored, text over gradient ── */
        <div className="absolute inset-0 flex flex-col items-center justify-end p-4 gap-1">
          {showProvider && (
            <span
              className="text-white/35 uppercase tracking-widest font-mono text-center"
              style={{ fontSize: '9px', fontWeight: 500, lineHeight: 1.2 }}
            >
              {provider}
            </span>
          )}
          <span
            className="text-white/80 line-clamp-2 text-center fp-text-shadow"
            style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.35 }}
          >
            {title}
          </span>
          <span
            className="text-white/25 group-hover:text-white/55 transition-colors duration-200 mt-1.5"
            style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}
          >
            open →
          </span>
        </div>
      ) : (
        /* ── Text-only: owner label centered, source quiet at bottom ── */
        <div className="absolute inset-0 flex flex-col p-5">
          {/* Owner truth — centered, readable */}
          <div className="flex-1 flex flex-col items-center justify-center gap-2 min-w-0">
            <span
              className="text-white/85 line-clamp-3 text-center fp-text-shadow"
              style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.35 }}
            >
              {title}
            </span>
            {description && (
              <span
                className="text-white/45 line-clamp-2 text-center"
                style={{ fontSize: '11px', lineHeight: 1.45 }}
              >
                {description}
              </span>
            )}
          </div>
          {/* Source truth — quiet, below */}
          <div className="flex flex-col items-center gap-1">
            {showProvider && (
              <span
                className="text-white/25 uppercase tracking-widest font-mono text-center"
                style={{ fontSize: '8px', fontWeight: 500, letterSpacing: '0.16em' }}
              >
                {provider}
              </span>
            )}
            <span
              className="text-white/25 group-hover:text-white/55 transition-colors duration-200"
              style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}
            >
              open →
            </span>
          </div>
        </div>
      )}
    </a>
  )
}
