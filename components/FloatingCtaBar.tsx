'use client'

import { useState, useEffect, useRef } from 'react'

export default function FloatingCtaBar({ isOwner = false }: { isOwner?: boolean }) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 200)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (isOwner || dismissed) return null

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, redirect: window.location.pathname }),
      })
      if (res.ok) {
        setSent(true)
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}))
        setError(data.error || 'failed to send')
      }
    } catch {
      setError('network error')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try {
      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', redirect: window.location.pathname }),
      })
      const data = await res.json()
      if (data.url) {
        document.cookie = `post_auth_redirect=${window.location.pathname};path=/;max-age=600;SameSite=Lax`
        window.location.href = data.url
      }
    } catch {}
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
      <div style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          make yours
        </span>

        {sent ? (
          <p style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', margin: 0, textTransform: 'uppercase' }}>
            check your email
          </p>
        ) : (
          <>
            <form onSubmit={handleEmail} style={{ display: 'flex', width: '100%', gap: '8px' }}>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '13px',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  fontFamily: 'inherit',
                  outline: 'none',
                  opacity: loading ? 0.5 : 1,
                }}
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255,255,255,0.9)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#0a0a0a',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: loading ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: loading || !email.trim() ? 0.4 : 1,
                }}
              >
                {loading ? '...' : '\u2192'}
              </button>
              <button
                type="button"
                onClick={handleGoogle}
                aria-label="Continue with Google"
                style={{
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                </svg>
              </button>
            </form>
            {error && (
              <p style={{ fontSize: '10px', color: 'rgba(255,120,120,0.7)', margin: 0, letterSpacing: '0.05em' }}>{error}</p>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute',
          top: '12px',
          right: '16px',
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.25)',
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
