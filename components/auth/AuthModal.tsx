'use client'

import { useState, useCallback, useEffect, FormEvent } from 'react'
import OAuthButton from './OAuthButton'

interface AuthModalProps {
  /** Where to send the user after auth succeeds. Used by OAuthButton. */
  redirectAfterAuth?: string
  /** If provided, shows an X close button in the top right that calls this. */
  onClose?: () => void
  /** Show the $10 price line under the buttons (gated by seed phase upstream). */
  showPrice?: boolean
}

/**
 * AuthModal — the unified sign-in card.
 *
 * One component shared by:
 *   - SovereignTile (public profile claim flow at /{slug}?claim=1)
 *   - app/[slug]/home/page.tsx (editor 401 overlay)
 *
 * Layout (top to bottom):
 *   - X close (optional)
 *   - Continue with Google
 *   - "or" divider
 *   - Email input + → submit  (POST /api/auth/magic-link)
 *   - $10 price line (optional)
 *
 * No title, no subtitle. Footprint's wordless mono aesthetic.
 */
export default function AuthModal({ redirectAfterAuth, onClose, showPrice }: AuthModalProps) {
  const [email, setEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Keyboard: Escape closes when onClose is provided
  useEffect(() => {
    if (!onClose) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleEmailSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || emailLoading) return
    setEmailLoading(true)
    setEmailError(null)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      if (res.ok) {
        setEmailSent(true)
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}))
        setEmailError(data.error || 'failed to send')
      }
    } catch {
      setEmailError('network error')
    } finally {
      setEmailLoading(false)
    }
  }, [email, emailLoading])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in or sign up"
      className="claim-overlay-enter relative"
      style={{
        width: 'min(88vw, 380px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '48px 32px',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign-in"
          className="touch-manipulation"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.3)',
            fontSize: '20px',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
            transition: 'color 200ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
        >
          ×
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        <OAuthButton provider="google" label="google" redirectAfterAuth={redirectAfterAuth} />
      </div>

      <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <div style={{ flex: 1, height: 0, borderTop: '1px solid rgba(255,255,255,0.12)' }} />
        <span
          className="font-mono"
          style={{
            fontSize: '10px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          or
        </span>
        <div style={{ flex: 1, height: 0, borderTop: '1px solid rgba(255,255,255,0.12)' }} />
      </div>

      {emailSent ? (
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
        <form onSubmit={handleEmailSubmit} style={{ width: '100%' }}>
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
              aria-label="Email address"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={emailLoading}
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
              disabled={emailLoading || !email.trim()}
              aria-label="continue"
              className="touch-manipulation"
              style={{
                background: 'transparent',
                border: 'none',
                borderLeft: '1px solid rgba(255,255,255,0.18)',
                color: emailLoading || !email.trim() ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)',
                padding: '0 20px',
                fontSize: '16px',
                cursor: emailLoading || !email.trim() ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: 'color 200ms ease',
              }}
            >
              {emailLoading ? '...' : '\u2192'}
            </button>
          </div>
          {emailError && (
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
              {emailError}
            </p>
          )}
        </form>
      )}

      {showPrice && (
        <span
          className="font-mono"
          style={{
            fontSize: '13px',
            fontWeight: 300,
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.06em',
            marginTop: 4,
          }}
        >
          $10
        </span>
      )}
    </div>
  )
}
