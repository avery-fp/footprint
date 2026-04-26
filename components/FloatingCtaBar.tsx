'use client'

import { useState } from 'react'

/**
 * FloatingCtaBar — visitor-facing "Make yours →" CTA at the bottom of
 * every public footprint. Clicking creates an anonymous draft footprint
 * and drops the visitor into /{tempSlug}/home to start building.
 */
export default function FloatingCtaBar({ isOwner = false }: { isOwner?: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const visible = true

  if (isOwner || dismissed) return null

  const handleMakeYours = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/draft/create', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data?.tempSlug) {
        window.location.href = `/${data.tempSlug}/home`
        return
      }
    } catch {
      // fall through
    }
    setLoading(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        padding: '16px 20px calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(10, 10, 10, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={handleMakeYours}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            background: '#d4c5a9',
            color: '#0c0c10',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.02em',
            border: 'none',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'preparing…' : 'make yours →'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.3)',
            fontSize: '11px',
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          not now
        </button>
      </div>
    </div>
  )
}
