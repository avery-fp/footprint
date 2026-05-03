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
 * Always-fetch the universal link preview for a clean title (provider's
 * marketing description is dropped). Listings are optional enrichment;
 * they appear only when extraction returns real public items.
 */
function useDepthData(url: string, providerId: string) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [listings, setListings] = useState<ListingsState>({ listings: [], count: null })

  useEffect(() => {
    let alive = true
    setPreview(null)
    setListings({ listings: [], count: null })

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LinkPreview | null) => {
        if (alive && data) setPreview(data)
      })
      .catch(() => {})

    if (providerId === 'grailed') {
      fetch(`/api/grailed-favorites?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!alive || !data) return
          const arr: GrailedListing[] = Array.isArray(data.listings) ? data.listings : []
          setListings({ listings: arr, count: typeof data.count === 'number' ? data.count : null })
        })
        .catch(() => {})
    }

    return () => {
      alive = false
    }
  }, [url, providerId])

  return { preview, listings }
}

function cleanTitle(t: string | null | undefined): string | null {
  if (!t) return null
  const stripped = t
    .replace(/\s*[|–·-]\s*Grailed\s*$/i, '')
    .replace(/^Grailed\s*[|–·-]\s*/i, '')
    .trim()
  return stripped || null
}

function handleFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean)
    if (path.length === 0) return null
    // /users/<id>/favorites — opaque numeric id, no readable handle
    if (path[0] === 'users') return null
    // Skip system paths
    if (/^(designers|categories|listings|sold|search|sell|signin|signup)$/i.test(path[0])) return null
    return path[0]
  } catch {
    return null
  }
}

function HeartGlyph({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 21s-7.5-4.5-9.5-9C1 8 3.5 4 7.5 4c2 0 3.4 1 4.5 2.4C13.1 5 14.5 4 16.5 4 20.5 4 23 8 21.5 12c-2 4.5-9.5 9-9.5 9z" />
    </svg>
  )
}

/**
 * The collection plate — closet portal motif. A warm, dim, bookmark-like
 * surface. Never a thumbnail of marketplace content; this is the door,
 * not a window.
 */
function CollectionPlate({
  size,
  tone,
  centerLabel,
  bottomLabel,
}: {
  size: number
  tone: 'dark' | 'light'
  centerLabel: string | null
  bottomLabel: string | null
}) {
  const isLight = tone === 'light'
  const surface = isLight
    ? 'linear-gradient(135deg, rgba(244,234,222,0.9) 0%, rgba(228,212,196,0.9) 100%)'
    : 'linear-gradient(135deg, rgba(50,40,32,0.85) 0%, rgba(28,22,18,0.95) 100%)'
  const heartColor = isLight ? 'rgba(120,70,40,0.55)' : 'rgba(232,196,160,0.65)'
  const fg = isLight ? 'rgba(60,40,28,0.78)' : 'rgba(232,220,200,0.78)'
  const sub = isLight ? 'rgba(60,40,28,0.45)' : 'rgba(232,220,200,0.45)'
  const innerBorder = isLight ? 'rgba(60,40,28,0.10)' : 'rgba(232,196,160,0.12)'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.16),
        background: surface,
        border: `1px solid ${innerBorder}`,
        boxShadow: isLight
          ? 'inset 0 1px 0 rgba(255,250,242,0.6), 0 1px 2px rgba(40,28,20,0.06)'
          : 'inset 0 1px 0 rgba(255,220,180,0.06), 0 1px 2px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Math.round(size * 0.12),
        gap: Math.max(2, Math.round(size * 0.04)),
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <HeartGlyph size={Math.round(size * 0.28)} color={heartColor} />
      {centerLabel && (
        <div
          style={{
            fontSize: Math.max(9, Math.round(size * 0.11)),
            fontWeight: 500,
            color: fg,
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {centerLabel}
        </div>
      )}
      {bottomLabel && (
        <div
          style={{
            fontSize: Math.max(7, Math.round(size * 0.075)),
            color: sub,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
          }}
        >
          {bottomLabel}
        </div>
      )}
    </div>
  )
}

function ExpandedTray({
  provider,
  url,
  title,
  handle,
  listings,
  isOpen,
  onClose,
}: {
  provider: DepthProvider
  url: string
  title: string | null
  handle: string | null
  listings: GrailedListing[]
  isOpen: boolean
  onClose: () => void
}) {
  const centerLabel = handle ? `@${handle}` : title || 'Favorites'

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
        className={`relative w-full max-w-[420px] overflow-hidden transition-all duration-300 ${
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
          {/* Closet portal — same plate motif, scaled up */}
          <div style={{ padding: '24px 16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <CollectionPlate
              size={148}
              tone="light"
              centerLabel={centerLabel}
              bottomLabel={provider.descriptor || 'FAVORITES'}
            />
            {title && handle && (
              <p
                style={{
                  fontSize: 12,
                  color: 'rgba(40,28,20,0.55)',
                  margin: 0,
                  textAlign: 'center',
                  maxWidth: 280,
                  lineHeight: 1.35,
                }}
              >
                {title}
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
                padding: '7px 14px',
                textDecoration: 'none',
                marginTop: 2,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              open on Grailed →
            </a>
          </div>

          {/* Optional enrichment: real listings only when parser succeeds */}
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
  centerLabel,
  descriptor,
  source,
}: {
  centerLabel: string
  descriptor: string
  source: string
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        gap: 8,
      }}
    >
      <CollectionPlate size={64} tone="dark" centerLabel={centerLabel} bottomLabel={descriptor} />
      <span
        style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.42)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          letterSpacing: '0.04em',
        }}
      >
        open on {source} →
      </span>
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

  const cleanedTitle = useMemo(() => cleanTitle(preview?.title), [preview])
  const handle = useMemo(() => handleFromUrl(url), [url])
  const closedCenter = handle ? `@${handle}` : cleanedTitle || provider.expandedTitle
  const descriptor = provider.descriptor || 'FAVORITES'

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
        <ClosedFace centerLabel={closedCenter} descriptor={descriptor} source={provider.closedLabel} />
      </button>

      {mounted &&
        createPortal(
          <ExpandedTray
            provider={provider}
            url={url}
            title={cleanedTitle}
            handle={handle}
            listings={listings.listings}
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
          />,
          document.body
        )}
    </>
  )
}
