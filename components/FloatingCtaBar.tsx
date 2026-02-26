'use client'

import { useState, useEffect } from 'react'

interface FloatingCtaBarProps {
  username: string
  serial: string
  isOwner?: boolean
}

export default function FloatingCtaBar({ username, serial, isOwner }: FloatingCtaBarProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (isOwner) return null

  return (
    <a
      href="/signup"
      className="touch-manipulation"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
        right: '16px',
        opacity: visible ? 1 : 0,
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 0',
        color: 'rgba(255, 255, 255, 0.12)',
        fontSize: '11px',
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 400,
        letterSpacing: '1px',
        textDecoration: 'none',
        transition: 'opacity 1s ease, color 0.3s ease',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.12)' }}
    >
      <span>footprint</span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 12 12"
        fill="none"
        style={{ opacity: 0.5 }}
      >
        <path
          d="M2.5 9.5L9.5 2.5M9.5 2.5H4.5M9.5 2.5V7.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  )
}
