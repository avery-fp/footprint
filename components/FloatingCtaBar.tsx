'use client'

import { useState, useEffect } from 'react'

interface FloatingCtaBarProps {
  username: string
  serial: string
}

export default function FloatingCtaBar({ username, serial }: FloatingCtaBarProps) {
  const [visible, setVisible] = useState(false)
  const [hide, setHide] = useState(false)

  useEffect(() => {
    // Check user state — hide for published owners
    fetch('/api/user', { credentials: 'include' })
      .then(async (r) => {
        if (r.ok) {
          const fpRes = await fetch('/api/footprint-for-user', { credentials: 'include' })
          if (fpRes.ok) {
            const fpData = await fpRes.json()
            if (fpData.published) {
              // Signed in AND published → hide bar
              setHide(true)
            }
          }
        }
      })
      .catch(() => {})

    const timer = setTimeout(() => setVisible(true), 1000)
    return () => clearTimeout(timer)
  }, [])

  if (hide) return null

  return (
    <a
      href="/signup"
      className="floating-cta-bar"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)',
        left: '50%',
        transform: visible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(8px)',
        opacity: visible ? 0.92 : 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        height: '38px',
        padding: '0 16px',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '999px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
        color: 'white',
        fontSize: '13px',
        fontWeight: 300,
        letterSpacing: '0.5px',
        textDecoration: 'none',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{username}</span>
      <span style={{ opacity: 0.3, margin: '0 8px' }}>·</span>
      <span>#{serial}</span>
      <span style={{ opacity: 0.3, margin: '0 8px' }}>·</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        style={{ opacity: 0.7 }}
      >
        <path
          d="M2.5 9.5L9.5 2.5M9.5 2.5H4.5M9.5 2.5V7.5"
          stroke="white"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  )
}
