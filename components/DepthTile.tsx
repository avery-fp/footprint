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
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-[420px] rounded-2xl overflow-hidden transition-all duration-300 ${
          isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'
        }`}
        style={{ background: 'rgba(18,18,18,0.98)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}
        >
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
            {provider.expandedTitle}
          </span>
          <div className="flex items-center gap-3">
            <a
              href={provider.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(255,255,255,0.35)', display: 'flex' }}
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </a>
            <button
              onClick={onClose}
              className="hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(255,255,255,0.35)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable item grid */}
        <div className="overflow-y-auto" style={{ maxHeight: '65vh', padding: '12px' }}>
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
                    background: 'rgba(255,255,255,0.05)',
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
                      color: 'rgba(255,255,255,0.4)',
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
                      color: 'rgba(255,255,255,0.75)',
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                      {item.price}
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{item.age}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DepthTile({ provider }: DepthTileProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

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

  return (
    <>
      <button
        className="w-full h-full flex flex-col items-center justify-center gap-2"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(8px)',
          WebkitTapHighlightColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={() => setIsOpen(true)}
      >
        {/* 2×2 thumbnail preview */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2px',
            width: 52,
            height: 52,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {provider.previewItems.slice(0, 4).map((item) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={item.id}
              src={item.imageUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span
            style={{
              fontSize: '10px',
              color: 'rgba(255,255,255,0.35)',
              fontFamily: 'monospace',
              letterSpacing: '0.04em',
            }}
          >
            {provider.closedLabel}
          </span>
          {provider.descriptor && (
            <span
              style={{
                fontSize: '9px',
                color: 'rgba(255,255,255,0.2)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {provider.descriptor}
            </span>
          )}
        </div>
      </button>

      {mounted &&
        createPortal(
          <DepthModal provider={provider} isOpen={isOpen} onClose={() => setIsOpen(false)} />,
          document.body
        )}
    </>
  )
}
