'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { DepthProvider } from '@/lib/depth-providers'
import type { GrailedListing } from '@/lib/grailed-favorites'
import type { LinkPreview } from '@/lib/og'

interface DepthTileProps {
  provider: DepthProvider
  url: string
}

interface ListingsState {
  listings: GrailedListing[]
  count: number | null
}

/**
 * Always-fetch the universal link preview. Listings are optional
 * enrichment fetched in parallel. Either source becoming useful makes
 * the tile expandable; both failing leaves us with the source label only.
 */
function useDepthData(url: string, providerId: string) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [listings, setListings] = useState<ListingsState>({ listings: [], count: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setPreview(null)
    setListings({ listings: [], count: null })

    const tasks: Promise<unknown>[] = []

    tasks.push(
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: LinkPreview | null) => {
          if (alive && data) setPreview(data)
        })
        .catch(() => {})
    )

    if (providerId === 'grailed') {
      tasks.push(
        fetch(`/api/grailed-favorites?url=${encodeURIComponent(url)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!alive || !data) return
            const arr: GrailedListing[] = Array.isArray(data.listings) ? data.listings : []
            setListings({ listings: arr, count: typeof data.count === 'number' ? data.count : null })
          })
          .catch(() => {})
      )
    }

    Promise.allSettled(tasks).then(() => {
      if (alive) setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [url, providerId])

  return { preview, listings, loading }
}

function cleanTitle(t: string | null | undefined, fallback: string): string {
  if (!t) return fallback
  // Strip trailing " | Grailed" / " - Grailed" / " · Grailed" suffixes.
  return t.replace(/\s*[|–·-]\s*Grailed\s*$/i, '').trim() || fallback
}

function ExpandedTray({
  provider,
  url,
  preview,
  listings,
  isOpen,
  onClose,
}: {
  provider: DepthProvider
  url: string
  preview: LinkPreview | null
  listings: GrailedListing[]
  isOpen: boolean
  onClose: () => void
}) {
  const title = cleanTitle(preview?.title, provider.expandedTitle)
  const description = preview?.description ?? null
  const heroImage = preview?.image ?? listings[0]?.imageUrl ?? null

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(20,16,14,0.55)', backdropFilter: 'blur(14px)' }}
      />
      <div
        className={`relative w-full max-w-[460px] overflow-hidden transition-all duration-300 ${
          isOpen ? 'scale-100 translate-y-0' : 'scale-[0.97] translate-y-2'
        }`}
        style={{
          background: 'rgba(250,246,240,0.94)',
          border: '1px solid rgba(60,40,28,0.10)',
          borderRadius: 18,
          boxShadow: '0 24px 60px -20px rgba(40,28,20,0.35), 0 2px 8px rgba(40,28,20,0.08)',
          backdropFilter: 'blur(24px) saturate(140%)',
          color: 'rgba(40,28,20,0.92)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid rgba(60,40,28,0.08)' }}
        >
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {provider.expandedTitle}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'rgba(60,40,28,0.45)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {provider.closedLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              color: 'rgba(40,28,20,0.45)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '72vh' }}>
          {/* Universal preview — always rendered when we have any metadata */}
          <div style={{ padding: 16 }}>
            {heroImage && (
              <div
                style={{
                  aspectRatio: '16/10',
                  overflow: 'hidden',
                  borderRadius: 12,
                  background: 'rgba(60,40,28,0.06)',
                  marginBottom: 12,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt={title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            )}
            <p
              style={{
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.3,
                margin: '0 0 6px',
                color: 'rgba(40,28,20,0.95)',
              }}
            >
              {title}
            </p>
            {description && (
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: 'rgba(40,28,20,0.65)',
                  margin: '0 0 12px',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {description}
              </p>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 500,
                color: 'rgba(40,28,20,0.92)',
                background: 'rgba(60,40,28,0.06)',
                border: '1px solid rgba(60,40,28,0.10)',
                borderRadius: 999,
                padding: '6px 12px',
                textDecoration: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              open on Grailed →
            </a>
          </div>

          {/* Optional enrichment: real listings if extracted */}
          {listings.length > 0 && (
            <div
              style={{
                padding: 14,
                borderTop: '1px solid rgba(60,40,28,0.08)',
              }}
            >
              <p
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'rgba(60,40,28,0.55)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  margin: '0 0 10px 2px',
                }}
              >
                items
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {listings.map((item) => (
                  <a
                    key={item.id}
                    href={item.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        aspectRatio: '3/4',
                        overflow: 'hidden',
                        borderRadius: 10,
                        background: 'rgba(60,40,28,0.06)',
                        marginBottom: 8,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.title || item.brand || 'listing'}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="group-hover:scale-[1.03] transition-transform duration-300"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </div>
                    <div>
                      {item.brand && (
                        <p
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: 'rgba(60,40,28,0.55)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            margin: '0 0 2px',
                          }}
                        >
                          {item.brand}
                        </p>
                      )}
                      {item.title && (
                        <p
                          style={{
                            fontSize: 11,
                            color: 'rgba(40,28,20,0.85)',
                            lineHeight: 1.3,
                            margin: '0 0 4px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.title}
                        </p>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        {item.price && (
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(40,28,20,0.92)' }}>
                            {item.price}
                          </span>
                        )}
                        {item.size && (
                          <span
                            style={{
                              fontSize: 9,
                              color: 'rgba(60,40,28,0.45)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            {item.size}
                          </span>
                        )}
                      </div>
                      {(item.age || item.location) && (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 9,
                            color: 'rgba(60,40,28,0.40)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          {item.age && <span>{item.age}</span>}
                          {item.location && (
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.location}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ClosedFace({
  image,
  label,
  source,
  title,
  count,
}: {
  image: string | null
  label: string
  source: string
  title: string | null
  count: number | null
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full h-full">
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 8,
          overflow: 'hidden',
          background:
            'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 70%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'saturate(0.92)' }}
          />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, maxWidth: '85%' }}>
        <span
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.4)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            letterSpacing: '0.04em',
          }}
        >
          {source}
        </span>
        <span
          style={{
            fontSize: 9,
            color: 'rgba(255,255,255,0.22)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          {label}
          {count != null ? ` · ${count}` : ''}
        </span>
        {title && (
          <span
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.55)',
              textAlign: 'center',
              lineHeight: 1.25,
              marginTop: 2,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </span>
        )}
      </div>
    </div>
  )
}

export default function DepthTile({ provider, url }: DepthTileProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { preview, listings } = useDepthData(url, provider.id)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  const closedImage = useMemo(
    () => preview?.image || listings.listings[0]?.imageUrl || null,
    [preview, listings]
  )
  const closedTitle = useMemo(
    () => (preview?.title ? cleanTitle(preview.title, '') || null : null),
    [preview]
  )
  const closedCount = listings.count ?? (listings.listings.length || null)

  return (
    <>
      <button
        className="w-full h-full"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(8px)',
          WebkitTapHighlightColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={() => setIsOpen(true)}
      >
        <ClosedFace
          image={closedImage}
          label={provider.descriptor || ''}
          source={provider.closedLabel}
          title={closedTitle}
          count={closedCount}
        />
      </button>

      {mounted &&
        createPortal(
          <ExpandedTray
            provider={provider}
            url={url}
            preview={preview}
            listings={listings.listings}
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
          />,
          document.body
        )}
    </>
  )
}
