'use client'

import { useState, useEffect } from 'react'

export default function FloatingCtaBar({
  isLoggedIn = false,
  isOwner = false,
}: {
  isLoggedIn?: boolean
  isOwner?: boolean
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 800)
    return () => clearTimeout(timer)
  }, [])

  if (isOwner) return null

  return (
    <a
      href={isLoggedIn ? '/home' : '/login?redirect=%2Fhome'}
      className="touch-manipulation"
      style={{
        position: 'fixed',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        left: 'max(12px, env(safe-area-inset-left, 0px))',
        right: 'max(12px, env(safe-area-inset-right, 0px))',
        marginInline: 'auto',
        width: 'fit-content',
        maxWidth: 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))',
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
        fontSize: '12px',
        fontWeight: 400,
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
        textDecoration: 'none',
        transition: 'opacity 0.8s ease, background 0.3s ease',
        pointerEvents: visible ? 'auto' : 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
    >
      {isLoggedIn ? 'home' : 'connect with google'}
    </a>
  )
}
