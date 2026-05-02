'use client'

/**
 * ARTIFACT TILE — museum-wall fallback for any external URL
 *
 * Resting: title or domain, provider label, optional image, "open →"
 * No broken image placeholders. No raw iframes. No undefined labels.
 * This is the default for Twitter/X and all unsupported links.
 */

import { useState } from 'react'

interface ArtifactTileProps {
  title: string      // pre-sanitized, never empty
  provider: string   // pre-sanitized, never empty
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
  // (happens for unknown URLs with no OG title — domain appears twice).
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
        {!showImage && description && (
          <span
            className="text-white/35 line-clamp-2 text-center mt-0.5"
            style={{ fontSize: '10px', lineHeight: 1.4 }}
          >
            {description}
          </span>
        )}
        <span
          className="text-white/25 group-hover:text-white/55 transition-colors duration-200 mt-1.5"
          style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}
        >
          open →
        </span>
      </div>
    </a>
  )
}
