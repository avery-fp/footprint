'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ClaimCeremony from '@/components/ClaimCeremony'

/**
 * SovereignTile — self-contained claim flow.
 *
 * ONE component, ONE init effect, ONE phase variable.
 * No race conditions. No parent state dependencies.
 *
 * Phase: init → auth → [OAuth] → username → [Stripe] → processing → ceremony → done
 */

interface SovereignTileProps {
  slug: string
  onDismiss: () => void
  onComplete: (slug: string) => void
}

type Phase = 'init' | 'auth' | 'username' | 'processing' | 'ceremony' | 'done'
type AuthSub = 'buttons' | 'email-input' | 'email-sent'

export default function SovereignTile({ slug, onDismiss, onComplete }: SovereignTileProps) {
  const [phase, setPhase] = useState<Phase>('init')
  const [authSub, setAuthSub] = useState<AuthSub>('buttons')
  const [authError, setAuthError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serial, setSerial] = useState<number | null>(null)
  const [finalSlug, setFinalSlug] = useState('')
  const finalizeCalledRef = useRef(false)

  // ── ONE init effect — replaces 5 racing effects ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const returnUsername = params.get('username')

    // Clean URL
    if (sessionId || params.get('claim')) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    // Check auth, then decide phase
    fetch('/api/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const authed = !!data?.user

        if (sessionId && returnUsername && authed) {
          // Stripe return — finalize immediately
          setPhase('processing')
          finalize(sessionId, returnUsername)
        } else if (authed) {
          setPhase('username')
        } else {
          setPhase('auth')
        }
      })
      .catch(() => setPhase('auth'))
  }, [])

  // ── Finalize Stripe payment ──
  async function finalize(sessionId: string, username: string) {
    if (finalizeCalledRef.current) return
    finalizeCalledRef.current = true

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'finalize', session_id: sessionId, username }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (data.success && data.serial) {
        setSerial(data.serial)
        setFinalSlug(data.slug || username)
        setPhase('ceremony')
      } else {
        setPhase('username')
      }
    } catch {
      setPhase('username')
    } finally {
      clearTimeout(timeout)
    }
  }

  // ── Username availability check (debounced) ──
  useEffect(() => {
    if (phase !== 'username' || !username || username.length < 2) {
      setAvailable(null)
      setChecking(false)
      return
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(username) || username.length > 30) {
      setAvailable(false)
      setChecking(false)
      return
    }
    setChecking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'check-username', username }),
        })
        const data = await res.json()
        setAvailable(data.available === true)
      } catch {
        setAvailable(null)
      }
      setChecking(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [username, phase])

  // ── OAuth handler ──
  const handleOAuth = useCallback(async (provider: 'google' | 'apple') => {
    setAuthError(null)
    const redirectPath = `/${slug}?claim=1`
    document.cookie = `post_auth_redirect=${redirectPath};path=/;max-age=600;SameSite=Lax`
    try {
      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, redirect: redirectPath }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setAuthError(data.error || `couldn't start ${provider} sign-in`)
      }
    } catch {
      setAuthError('network error — try again')
    }
  }, [slug])

  // ── Magic link handler ──
  const handleMagicLink = useCallback(async () => {
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setAuthError('enter a valid email')
      return
    }
    setAuthError(null)
    setEmailLoading(true)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAuthSub('email-sent')
      } else {
        setAuthError(data.error || "couldn't send link")
      }
    } catch {
      setAuthError('network error — try again')
    } finally {
      setEmailLoading(false)
    }
  }, [email])

  // ── Submit username → Stripe ──
  const handleSubmit = useCallback(async () => {
    if (!available || loading || !username) return
    setLoading(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'publish-paid',
          username,
          return_to: `/${slug}?claim=1`,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setLoading(false)
      }
    } catch {
      setLoading(false)
    }
  }, [available, loading, username, slug])

  // ── Ceremony phase — full screen ──
  if (phase === 'ceremony' && serial) {
    return (
      <ClaimCeremony
        serial={serial}
        slug={finalSlug || username}
        onComplete={() => onComplete(finalSlug || username)}
      />
    )
  }

  // ── Init phase — invisible ──
  if (phase === 'init') return null

  // ── Render the tile ──
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ pointerEvents: 'auto' }}
      onClick={onDismiss}
    >
      <div
        className="claim-overlay-enter"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(88vw, 380px)',
          minHeight: '280px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '32px',
          padding: '48px 32px',
          background: 'rgba(255,255,255,0.02)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '24px',
        }}
      >
        {/* Auth phase */}
        {phase === 'auth' && authSub === 'buttons' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              {(['google', 'apple', 'email'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => {
                    setAuthError(null)
                    if (method === 'email') setAuthSub('email-input')
                    else handleOAuth(method)
                  }}
                  className="touch-manipulation font-mono"
                  style={{
                    width: '100%',
                    height: '44px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '12px',
                    letterSpacing: '0.08em',
                    textTransform: 'lowercase' as const,
                    cursor: 'pointer',
                    transition: 'background 200ms ease, color 200ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.95)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                  }}
                >
                  {method}
                </button>
              ))}
            </div>

            <span className="font-mono" style={{ fontSize: '13px', fontWeight: 300, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
              $10
            </span>

            {authError && (
              <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,120,120,0.7)', letterSpacing: '0.04em', marginTop: '-12px' }}>
                {authError}
              </span>
            )}
          </>
        )}

        {/* Auth — email input */}
        {phase === 'auth' && authSub === 'email-input' && (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setAuthError(null) }}
              placeholder="your@email.com"
              autoFocus
              inputMode="email"
              autoComplete="email"
              className="font-mono"
              style={{
                width: '100%',
                height: '44px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: '13px',
                padding: '0 16px',
                outline: 'none',
                letterSpacing: '0.02em',
                textAlign: 'center',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleMagicLink() }}
            />

            <button
              onClick={handleMagicLink}
              disabled={emailLoading}
              className="touch-manipulation font-mono"
              style={{
                width: '100%',
                height: '44px',
                background: 'rgba(255,255,255,0.9)',
                border: 'none',
                borderRadius: '12px',
                color: '#0a0a0a',
                fontSize: '12px',
                letterSpacing: '0.08em',
                textTransform: 'lowercase' as const,
                cursor: emailLoading ? 'default' : 'pointer',
                opacity: emailLoading ? 0.5 : 1,
                transition: 'opacity 200ms ease',
              }}
            >
              {emailLoading ? '...' : 'continue'}
            </button>

            {authError && (
              <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,120,120,0.7)', letterSpacing: '0.04em' }}>
                {authError}
              </span>
            )}

            <button
              onClick={() => { setAuthSub('buttons'); setAuthError(null) }}
              className="font-mono"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                cursor: 'pointer',
                textTransform: 'lowercase' as const,
              }}
            >
              ← back
            </button>
          </>
        )}

        {/* Auth — email sent confirmation */}
        {phase === 'auth' && authSub === 'email-sent' && (
          <>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="font-mono" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.02em' }}>
                check your inbox
              </span>
              <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>
                we sent a link to {email}
              </span>
            </div>

            <button
              onClick={() => { setAuthSub('buttons'); setEmail(''); setAuthError(null) }}
              className="font-mono"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                cursor: 'pointer',
                textTransform: 'lowercase' as const,
              }}
            >
              ← back
            </button>
          </>
        )}

        {/* Username — fp.onl/________ + $10 + → */}
        {phase === 'username' && (
          <>
            <div className="flex items-baseline gap-0">
              <span className="font-mono" style={{ fontSize: '16px', fontWeight: 300, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.02em' }}>
                fp.onl/
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                autoFocus
                maxLength={30}
                className="font-mono"
                style={{
                  fontSize: '16px',
                  fontWeight: 300,
                  color: available === true ? 'rgba(130,255,180,0.6)' : available === false ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.6)',
                  background: 'none',
                  border: 'none',
                  borderBottom: '0.5px solid rgba(255,255,255,0.08)',
                  outline: 'none',
                  letterSpacing: '0.02em',
                  width: `${Math.max(username.length, 6)}ch`,
                  padding: '4px 0',
                  caretColor: 'rgba(255,255,255,0.4)',
                  transition: 'color 300ms ease',
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              />
              {checking && (
                <span className="font-mono ml-2" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>...</span>
              )}
            </div>

            <span className="font-mono" style={{ fontSize: '13px', fontWeight: 300, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
              $10
            </span>

            <button
              onClick={handleSubmit}
              disabled={!available || loading}
              className="touch-manipulation font-mono"
              style={{
                background: 'none',
                border: 'none',
                color: available && !loading ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
                fontSize: '18px',
                cursor: available && !loading ? 'pointer' : 'default',
                padding: '12px',
                transition: 'color 200ms ease',
              }}
              onMouseEnter={(e) => { if (available && !loading) e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = available && !loading ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)' }}
            >
              {loading ? '...' : '\u2192'}
            </button>
          </>
        )}

        {/* Processing */}
        {phase === 'processing' && (
          <span className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em' }}>...</span>
        )}
      </div>
    </div>
  )
}
