'use client'

import { useState, useEffect } from 'react'

export default function FloatingCtaBar() {
  const [visible, setVisible] = useState(false)
  const [hide, setHide] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  // Hide for any logged-in user who already has a published footprint
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(r => {
        if (!r.ok) return // not logged in — show CTA
        return fetch('/api/footprint-for-user', { credentials: 'include' })
      })
      .then(r => {
        if (!r || !r.ok) return
        return r.json()
      })
      .then(data => {
        if (data?.published) setHide(true)
      })
      .catch(() => {}) // silent — default to showing CTA
  }, [])

  if (hide) return null

  return (
    <a
      href="/signup"
      className="touch-manipulation"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: visible ? 1 : 0,
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 20px',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '999px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '12px',
        fontWeight: 400,
        letterSpacing: '0.5px',
        textDecoration: 'none',
        transition: 'opacity 1s ease, background 0.3s ease',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
    >
      <span>footprint</span>
      <span style={{ opacity: 0.4 }}>{'\u00B7'}</span>
      <span>$10</span>
      <span style={{ opacity: 0.4 }}>{'\u00B7'}</span>
      <span>make yours</span>
      <span style={{ opacity: 0.5 }}>{'\u2192'}</span>
    </a>
  )
}
