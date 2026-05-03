'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { DepthProvider } from '@/lib/depth-providers'

interface DepthTileProps {
  provider: DepthProvider
  url: string
}

function DepthModal({
  provider,
  isOpen,
  onClose,
}: {
  provider: DepthProvider
  isOpen: boolean
  onClose: () => void
}) {
  return (
    <div
      className={`fixed inset-0 z-[200] flex items-end sm:items-center justify-center transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative w-full sm:max-w-[380px] sm:rounded-2xl overflow-hidden transition-all duration-300 ${
          isOpen ? 'translate-y-0' : 'translate-y-4'
        }`}
        style={{
          background: 'rgba(14,14,14,0.97)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span
            style={{
              fontSize: '12px',
              color: 'rgba(255,255,255,0.45)',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {provider.username}
          </span>
          <div className="flex items-center gap-3">
            <a
              href={provider.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.30)',
                fontFamily: 'monospace',
                letterSpacing: '0.04em',
                textDecoration: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              open on grailed
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </a>
            <button
              onClick={onClose}
              className="flex hover:opacity-70 transition-opacity"
              style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        {provider.previewItems.length > 0 ? (
          <div className="overflow-y-auto" style={{ maxHeight: '60vh', padding: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {provider.previewItems.map((item) => (
                <a
                  key={item.id}
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                  style={{ textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      aspectRatio: '3/4',
                      overflow: 'hidden',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      marginBottom: '6px',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="group-hover:scale-105 transition-transform duration-300"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.35)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        margin: '0 0 2px',
                      }}
                    >
                      {item.brand}
                    </p>
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.70)',
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
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.80)' }}>
                      {item.price}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '48px 24px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.15)',
                fontFamily: 'monospace',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
              }}
            >
              grailed
            </span>
            <span
              style={{
                fontSize: '18px',
                color: 'rgba(255,255,255,0.65)',
                fontWeight: 300,
                letterSpacing: '-0.02em',
              }}
            >
              {provider.username}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.25)',
                fontFamily: 'monospace',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: '24px',
              }}
            >
              {provider.section}
            </span>
            <a
              href={provider.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-70 transition-opacity"
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.35)',
                fontFamily: 'monospace',
                letterSpacing: '0.06em',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              open on grailed
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DepthTile({ provider }: DepthTileProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  return (
    <>
      {/* Closed tile — branded collection plate */}
      <div
        className="relative w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer select-none"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        onClick={() => setIsOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(true) }}
      >
        {/* Grailed wordmark */}
        <span
          style={{
            fontSize: '9px',
            color: 'rgba(255,255,255,0.18)',
            fontFamily: 'monospace',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          grailed
        </span>

        {/* Username */}
        <span
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.65)',
            fontWeight: 300,
            letterSpacing: '-0.01em',
          }}
        >
          {provider.username}
        </span>

        {/* Section label */}
        <span
          style={{
            fontSize: '8px',
            color: 'rgba(255,255,255,0.22)',
            fontFamily: 'monospace',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {provider.section}
        </span>

        {/* Open on Grailed link — stops propagation so it doesn't open the modal */}
        <a
          href={provider.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 hover:opacity-70 transition-opacity"
          style={{
            fontSize: '9px',
            color: 'rgba(255,255,255,0.20)',
            fontFamily: 'monospace',
            letterSpacing: '0.06em',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          open on grailed
          <svg width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          </svg>
        </a>
      </div>

      {mounted &&
        createPortal(
          <DepthModal provider={provider} isOpen={isOpen} onClose={() => setIsOpen(false)} />,
          document.body
        )}
    </>
  )
}
