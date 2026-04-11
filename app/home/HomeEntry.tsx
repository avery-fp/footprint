'use client'

import { useState, useCallback, FormEvent } from 'react'

/**
 * Minimal auth entry — black page, email input, nothing else.
 */
export default function HomeEntry() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
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
  }, [email, loading])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ width: 'min(88vw, 320px)' }}>
        {sent ? (
          <p
            className="font-mono"
            style={{
              fontSize: '12px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            check your email
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.18)',
                transition: 'border-color 200ms ease',
              }}
            >
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                aria-label="Email address"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="font-mono"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '16px 20px',
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  color: 'rgba(255,255,255,0.85)',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                aria-label="continue"
                className="touch-manipulation"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.18)',
                  color: loading || !email.trim() ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)',
                  padding: '0 20px',
                  fontSize: '16px',
                  cursor: loading || !email.trim() ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'color 200ms ease',
                }}
              >
                {loading ? '...' : '\u2192'}
              </button>
            </div>
            {error && (
              <p
                className="font-mono"
                style={{
                  marginTop: 8,
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: 'rgba(255,120,120,0.7)',
                  margin: '8px 0 0 0',
                }}
              >
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
