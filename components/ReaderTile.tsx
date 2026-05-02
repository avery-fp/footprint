'use client'

/**
 * READER TILE V1 — for articles, Substack, blogs
 *
 * Resting: headline, publication/author, short excerpt, optional image.
 * No raw iframes. No undefined fields. Image shown at low opacity as
 * atmospheric background only — never as a load-dependent element.
 */

import { useState } from 'react'

interface ReaderTileProps {
  title: string          // pre-sanitized, never empty
  publication: string    // provider / domain label
  author: string | null
  image: string | null
  description: string | null
  actionUrl: string
  aspectClass?: string
}

export default function ReaderTile({
  title,
  publication,
  author,
  image,
  description,
  actionUrl,
  aspectClass = 'aspect-square',
}: ReaderTileProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!image && !imgFailed

  return (
    <a
      href={actionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full ${aspectClass} fp-tile overflow-hidden relative group`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Atmospheric image — low opacity backdrop, never load-dependent */}
      {showImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.15 }}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.55) 100%)',
            }}
          />
        </>
      )}

      <div className="absolute inset-0 flex flex-col justify-end p-4 gap-1">
        {/* Publication / author */}
        <span
          className="text-white/35 uppercase tracking-widest font-mono"
          style={{ fontSize: '9px', fontWeight: 500, lineHeight: 1.2 }}
        >
          {author ? `${publication} · ${author}` : publication}
        </span>

        {/* Headline */}
        <span
          className="text-white/85 line-clamp-3 fp-text-shadow"
          style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.4 }}
        >
          {title}
        </span>

        {/* Excerpt */}
        {description && (
          <span
            className="text-white/40 line-clamp-2"
            style={{ fontSize: '10px', lineHeight: 1.4 }}
          >
            {description}
          </span>
        )}

        <span
          className="text-white/20 group-hover:text-white/50 transition-colors duration-200 mt-1.5"
          style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase' }}
        >
          read →
        </span>
      </div>
    </a>
  )
}
