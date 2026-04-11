'use client'

import { useState, useCallback, useEffect, FormEvent, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import OAuthButton from '@/components/auth/OAuthButton'
import PasskeyButton from '@/components/auth/PasskeyButton'

function HomeEntryInner() {
  const searchParams = useSearchParams()
  const authError = searchParams.get('auth_error')

  const [email, setEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ width: 'min(88vw, 320px)', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Google */}
        <OAuthButton
          provider="google"
          label="continue with google"
          redirectAfterAuth="/home"
        />

        {/* Apple — only renders if NEXT_PUBLIC_APPLE_ENABLED=true */}
        <OAuthButton
          provider="apple"
          label="continue with apple"
          redirectAfterAuth="/home"
        />

        {/* Passkey — only renders if WebAuthn supported */}
        <PasskeyButton redirectAfterAuth="/home" />

        {/* Divider */}
        <div
          aria-hidden
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '20px 0 0',
          }}
        >
          <div style={{ flex: 1, height: 0, borderTop: '1px solid rgba(255,255,255,0.10)' }} />
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.25)',
            }}
          >
            or
          </span>
          <div style={{ flex: 1, height: 0, borderTop: '1px solid rgba(255,255,255,0.10)' }} />
        </div>

        {/* Email / magic link */}
        {emailSent ? (
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
              margin: '20px 0 0',
              textAlign: 'center',
            }}
          >
            check your email
          </p>
        ) : (
          <form onSubmit={handleEmailSubmit} style={{ marginTop: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                width: '100%',
                border: '1px solid rgba(255,255,255,0.14)',
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
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '16px 20px',
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  color: 'rgba(255,255,255,0.85)',
                  fontFamily: 'monospace',
                }}
              />
              <button
                type="submit"
                disabled={emailLoading || !email.trim()}
                aria-label="continue"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.14)',
                  color: emailLoading || !email.trim() ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)',
                  padding: '0 20px',
                  fontSize: '16px',
                  cursor: emailLoading || !email.trim() ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'color 200ms ease',
                }}
              >
                {emailLoading ? '...' : '→'}
              </button>
            </div>
            {emailError && (
              <p
                style={{
                  fontFamily: 'monospace',
                  marginTop: 8,
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: 'rgba(255,120,120,0.7)',
                }}
              >
                {emailError}
              </p>
            )}
          </form>
        )}

        {authError && (
          <p style={{
            marginTop: 16,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#ff6b6b',
            textAlign: 'center',
            opacity: 0.7,
            letterSpacing: '0.05em',
          }}>
            auth failed at: {authError}
          </p>
        )}
      </div>
    </div>
  )
}

export default function HomeEntry() {
  return (
    <Suspense>
      <HomeEntryInner />
    </Suspense>
  )
}
