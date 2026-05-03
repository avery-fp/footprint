'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { DepthProvider } from '@/lib/depth-providers'
import type { GrailedListing } from '@/lib/grailed-favorites'

interface DepthTileProps {
  provider: DepthProvider
  url: string
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; listings: GrailedListing[]; count: number | null }
  | { status: 'empty' }

function useGrailedFavorites(url: string, providerId: string): FetchState {
  const [state, setState] = useState<FetchState>({ status: 'idle' })

  useEffect(() => {
    if (providerId !== 'grailed') return
    let alive = true
    setState({ status: 'loading' })
    fetch(`/api/grailed-favorites?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return
        const listings: GrailedListing[] = Array.isArray(data?.listings) ? data.listings : []
        if (listings.length === 0) {
          setState({ status: 'empty' })
        } else {
          setState({ status: 'ready', listings, count: data.count ?? null })
        }
      })
      .catch(() => {
        if (alive) setState({ status: 'empty' })
      })
    return () => {
      alive = false
    }
  }, [url, providerId])

  return state
}

function ExpandedTray({
  provider,
  url,
  listings,
  isOpen,
  onClose,
}: {
  provider: DepthProvider
  url: string
  listings: GrailedListing[]
  isOpen: boolean
  onClose: () => void
}) {
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

        <div className="overflow-y-auto" style={{ maxHeight: '68vh', padding: 14 }}>
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

        <div
          className="flex items-center justify-between px-5 py-3"
          style={{
            borderTop: '1px solid rgba(60,40,28,0.08)',
            fontSize: 10,
            color: 'rgba(60,40,28,0.45)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            letterSpacing: '0.04em',
          }}
        >
          <span>via {provider.closedLabel}</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(60,40,28,0.55)', textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            open ↗
          </a>
        </div>
      </div>
    </div>
  )
}

function ClosedCollage({
  images,
  label,
  source,
  count,
}: {
  images: string[]
  label: string
  source: string
  count: number | null
}) {
  const slots = useMemo(() => {
    const out: (string | null)[] = []
    for (let i = 0; i < 4; i++) out.push(images[i] ?? null)
    return out
  }, [images])

  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full h-full">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 2,
          width: 56,
          height: 56,
          borderRadius: 7,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.06)',
        }}
      >
        {slots.map((src, i) =>
          src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'saturate(0.92)' }}
            />
          ) : (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)' }} />
          )
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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
      </div>
    </div>
  )
}

function SealedFallback({ provider }: { provider: DepthProvider }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full h-full">
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 7,
          background:
            'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 70%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            letterSpacing: '0.04em',
          }}
        >
          {provider.closedLabel}
        </span>
        {provider.descriptor && (
          <span
            style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.2)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            {provider.descriptor}
          </span>
        )}
      </div>
    </div>
  )
}

export default function DepthTile({ provider, url }: DepthTileProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const fav = useGrailedFavorites(url, provider.id)

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

  const hasListings = fav.status === 'ready'
  const expandable = hasListings

  return (
    <>
      <button
        className="w-full h-full"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(8px)',
          WebkitTapHighlightColor: 'transparent',
          border: 'none',
          cursor: expandable ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (expandable) setIsOpen(true)
        }}
        disabled={!expandable}
      >
        {hasListings ? (
          <ClosedCollage
            images={fav.listings.map((l) => l.imageUrl).filter(Boolean).slice(0, 4)}
            label={provider.descriptor || ''}
            source={provider.closedLabel}
            count={fav.count ?? fav.listings.length}
          />
        ) : (
          <SealedFallback provider={provider} />
        )}
      </button>

      {mounted &&
        hasListings &&
        createPortal(
          <ExpandedTray
            provider={provider}
            url={url}
            listings={fav.listings}
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
          />,
          document.body
        )}
    </>
  )
}
