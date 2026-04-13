'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function FloatingCtaBar({ isOwner = false }: { isOwner?: boolean }) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [email, setEmail] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Show after scrolling 200px
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 200)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (isOwner || dismissed) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params = email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''
    router.push(`/home${params}`)
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
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: '400px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.35)',
          }}
        >
          make yours
        </span>

        <div style={{ display: 'flex', width: '100%', gap: '8px' }}>
          <input
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            style={{
              flex: 1,
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '13px',
              fontWeight: 400,
              letterSpacing: '0.02em',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              background: 'rgba(255, 255, 255, 0.9)',
              border: 'none',
              borderRadius: '6px',
              color: '#0a0a0a',
              fontSize: '12px',
              fontWeight: 500,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            go
          </button>
        </div>
      </form>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute',
          top: '12px',
          right: '16px',
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.25)',
          fontSize: '16px',
          cursor: 'pointer',
          padding: '4px',
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  )
}
