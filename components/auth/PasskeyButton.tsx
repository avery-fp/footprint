'use client'

import { useState, useEffect, useCallback } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { isPasskeySupported } from './passkey-support'

interface PasskeyButtonProps {
  /** Where to navigate after the passkey ceremony succeeds. */
  redirectAfterAuth?: string
}

/**
 * PasskeyButton — discoverable WebAuthn sign-in.
 *
 * Visual treatment mirrors OAuthButton (bordered, full-width, mono uppercase).
 * Hidden entirely on browsers without WebAuthn support.
 *
 * Flow:
 *   1. POST /api/auth/passkey/authenticate { action: 'options' } -> challenge + options
 *   2. startAuthentication(options) -> browser prompts Touch ID / Face ID
 *   3. POST /api/auth/passkey/authenticate { action: 'verify', response, challenge } -> session cookie set
 *   4. window.location.href = redirectAfterAuth || '/home'
 */
export default function PasskeyButton({ redirectAfterAuth }: PasskeyButtonProps) {
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Feature-detect after mount so SSR output stays consistent
  useEffect(() => {
    setSupported(isPasskeySupported())
  }, [])

  const handleClick = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const optsRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options' }),
      })
      if (!optsRes.ok) throw new Error('no passkey available')
      const options = await optsRes.json()

      const assertion = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', response: assertion, challenge: options.challenge }),
      })
      if (!verifyRes.ok) throw new Error('verification failed')

      window.location.href = redirectAfterAuth || '/home'
    } catch (err) {
      // User cancelling the WebAuthn prompt is the most common case — keep silent
      const msg = err instanceof Error ? err.message : ''
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('aborted')) {
        setError(msg || 'passkey sign-in failed')
      }
      setLoading(false)
    }
  }, [loading, redirectAfterAuth])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label="Sign in with passkey"
      className="touch-manipulation"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        width: '100%',
        padding: '16px 20px',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 0,
        color: 'rgba(255,255,255,0.6)',
        fontSize: '12px',
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        fontFamily: 'inherit',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'border-color 200ms ease, color 200ms ease',
        opacity: loading ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
        e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 11c0-1.1.9-2 2-2a2 2 0 1 1 0 4" />
        <path d="M5 15c0-3.5 2-6 7-6 1 0 1.93.13 2.78.36" />
        <path d="M9 19c-1.5-2-2-3.5-2-5" />
        <path d="M14 22c-2.5-2-3.5-4-4-7" />
        <path d="M18 21c-1.5-2.5-2-4-2-6" />
        <path d="M19.5 16c.5-1 .5-2 .5-3a8 8 0 0 0-13.6-5.7" />
        <path d="M3.5 12.5c.5-1 .5-2 .5-3" />
      </svg>
      <span>{loading ? '...' : error || 'passkey'}</span>
    </button>
  )
}
