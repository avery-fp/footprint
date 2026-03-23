'use client'

import { useState, useEffect } from 'react'

export default function FloatingCtaBar({ isOwner = false }: { isOwner?: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 800)
    return () => clearTimeout(timer)
  }, [])

  if (isOwner) return null

  return (
    <a
      href="/login"
      className="touch-manipulation"
      style={{
        position: 'fixed',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: visible ? 1 : 0.06,
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        padding: '10px 20px',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '9999px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: 'rgba(255, 255, 255, 0.75)',
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: '0.5px',
        textDecoration: 'none',
        transition: 'opacity 0.8s ease, background 0.3s ease',
        pointerEvents: visible ? 'auto' : 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
    >
      yours
    </a>
  )
}
