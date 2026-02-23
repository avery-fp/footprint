'use client'

import { useState, useEffect } from 'react'

interface FloatingCtaBarProps {
  username: string
  serial: string
}

export default function FloatingCtaBar({ username, serial }: FloatingCtaBarProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <a
      href="/checkout"
      className="fixed z-50 left-1/2 font-mono"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
        transform: visible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(6px)',
        opacity: visible ? 1 : 0,
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        height: '36px',
        padding: '0 18px',
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '999px',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
        textDecoration: 'none',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <span style={{
        color: 'rgba(255, 255, 255, 0.35)',
        fontSize: '11px',
        letterSpacing: '0.12em',
        textTransform: 'lowercase',
      }}>
        {username}
      </span>
      <span style={{ color: 'rgba(255, 255, 255, 0.12)', margin: '0 10px', fontSize: '9px' }}>·</span>
      <span style={{
        color: 'rgba(255, 255, 255, 0.25)',
        fontSize: '10px',
        letterSpacing: '0.08em',
      }}>
        #{serial}
      </span>
      <span style={{ color: 'rgba(255, 255, 255, 0.12)', margin: '0 10px', fontSize: '9px' }}>·</span>
      <span style={{
        color: 'rgba(255, 255, 255, 0.50)',
        fontSize: '11px',
        letterSpacing: '0.14em',
        textTransform: 'lowercase',
      }}>
        make yours
      </span>
    </a>
  )
}
