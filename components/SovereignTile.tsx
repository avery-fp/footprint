'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ClaimCeremony from '@/components/ClaimCeremony'

/**
 * SovereignTile — self-contained claim flow.
 *
 * ONE component, ONE init effect, ONE phase variable.
 * No race conditions. No parent state dependencies.
 *
 * Phase: init → username → [OAuth] → [Stripe] → processing → ceremony → done
 */

interface SovereignTileProps {
  slug: string
  onDismiss: () => void
  onComplete: (slug: string) => void
  /**
   * Stripe session_id captured by the parent (PublicPage) BEFORE it cleans
   * the URL. Must be passed as a prop because SovereignTile mounts lazily,
   * after the URL has been wiped. Null when not returning from Stripe.
   */
  sessionId?: string | null
  /**
   * Username captured from the URL alongside sessionId. Used by the Stripe
   * finalize flow to know which username was purchased.
   */
  returnUsername?: string | null
}

type Phase = 'init' | 'username' | 'processing' | 'ceremony' | 'done'
type SlugState = 'idle' | 'checking' | 'available' | 'open' | 'invalid'

function getInvalidMessage(username: string) {
  if (username.length < 2) return 'Too short'
  if (username.length > 30) return 'Too long'
  return 'Use letters, numbers, dots, or dashes'
}

export default function SovereignTile({ slug, onDismiss, onComplete, sessionId: propSessionId, returnUsername: propReturnUsername }: SovereignTileProps) {
  const [phase, setPhase] = useState<Phase>('init')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [slugState, setSlugState] = useState<SlugState>('idle')
  const [statusText, setStatusText] = useState('Type a name')
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serial, setSerial] = useState<number | null>(null)
  const [finalSlug, setFinalSlug] = useState('')
  const [seedPhase, setSeedPhase] = useState<boolean | null>(null)
  const finalizeCalledRef = useRef(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  // ── ONE init effect — replaces 5 racing effects ──
  useEffect(() => {
    // sessionId and returnUsername come from props, captured by PublicPage
    // BEFORE it cleans the URL. Reading window.location.search here would
    // always return empty because PublicPage's URL-cleanup effect fires
    // before SovereignTile mounts.
    const sessionId = propSessionId ?? null
    const returnUsername = propReturnUsername ?? null

    // Fetch seed phase status in parallel — UI uses it to hide $10
    fetch('/api/publish/phase')
      .then(r => r.ok ? r.json() : { seedPhase: false })
      .then(data => setSeedPhase(data.seedPhase === true))
      .catch(() => setSeedPhase(false))

    if (returnUsername) {
      setUsername(returnUsername.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
    }

    // Check auth and decide phase
    fetch('/api/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const authed = !!data?.user
        setIsAuthenticated(authed)

        if (sessionId && returnUsername && authed) {
          // Stripe return — finalize immediately
          setPhase('processing')
          finalize(sessionId, returnUsername)
        } else {
          setPhase('username')
        }
      })
      .catch(() => {
        setIsAuthenticated(false)
        setPhase('username')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (phase !== 'username') {
      setSlugState('idle')
      setStatusText('Type a name')
      setChecking(false)
      return
    }

    if (!username) {
      setSlugState('idle')
      setStatusText('Type a name')
      setChecking(false)
      return
    }

    if (username.length < 2 || !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(username) || username.length > 30) {
      setSlugState('invalid')
      setStatusText(getInvalidMessage(username))
      setChecking(false)
      return
    }

    setChecking(true)
    setSlugState('checking')
    setStatusText('Checking')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/check-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        })
        if (!res.ok) {
          setSlugState('idle')
          setStatusText('Try again')
          return
        }
        const data = await res.json()
        if (data.available === true) {
          setSlugState('available')
          setStatusText('Available')
        } else if (data.reason === 'taken') {
          setSlugState('open')
          setStatusText('Open')
        } else if (data.reason === 'reserved') {
          setSlugState('invalid')
          setStatusText('Reserved')
        } else {
          setSlugState('invalid')
          setStatusText(typeof data.reason === 'string' ? data.reason : 'Invalid')
        }
      } catch {
        setSlugState('idle')
        setStatusText('Try again')
      }
      setChecking(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [username, phase])

  useEffect(() => {
    if (phase !== 'username') return
    const focusTimer = window.setTimeout(() => {
      usernameInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(focusTimer)
  }, [phase])

  const startClaimOAuth = useCallback(async () => {
    setLoading(true)
    try {
      const redirectAfterAuth = `/${slug}?claim=1&username=${encodeURIComponent(username)}`
      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', redirect: redirectAfterAuth }),
      })

      const data: { url?: string; error?: string } = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        setStatusText(data.error || 'Sign in failed')
        setSlugState('idle')
        setLoading(false)
        return
      }

      document.cookie = `post_auth_redirect=${redirectAfterAuth};path=/;max-age=600;SameSite=Lax`
      window.location.href = data.url
    } catch {
      setStatusText('Sign in failed')
      setSlugState('idle')
      setLoading(false)
    }
  }, [slug, username])

  // ── Submit username → seed (instant) or paid (Stripe) ──
  const handleSubmit = useCallback(async () => {
    if (loading || !username) return
    if (slugState === 'open') {
      window.location.href = `/${username}`
      return
    }
    if (slugState !== 'available') return
    if (!isAuthenticated) {
      await startClaimOAuth()
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'publish',
          username,
          return_to: `/${slug}?claim=1`,
        }),
      })
      const data = await res.json()
      if (data.url) {
        // Paid path → Stripe redirect
        window.location.href = data.url
      } else if (data.success && data.serial) {
        // Seed path → instant ceremony
        setSerial(data.serial)
        setFinalSlug(data.slug || username)
        setPhase('ceremony')
      } else {
        setLoading(false)
      }
    } catch {
      setLoading(false)
    }
  }, [slugState, loading, username, slug, isAuthenticated, startClaimOAuth])

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

  // ── Username / processing — original tile chrome ──
  const canContinue = (slugState === 'available' || slugState === 'open') && !loading
  const statusColor =
    slugState === 'available'
      ? 'rgba(130,255,180,0.7)'
      : slugState === 'open'
      ? 'rgba(160,210,255,0.72)'
      : slugState === 'invalid'
      ? 'rgba(255,110,110,0.75)'
      : 'rgba(255,255,255,0.32)'
  const usernameColor =
    slugState === 'available'
      ? 'rgba(130,255,180,0.68)'
      : slugState === 'open'
      ? 'rgba(190,225,255,0.78)'
      : slugState === 'invalid'
      ? 'rgba(255,100,100,0.68)'
      : 'rgba(255,255,255,0.72)'

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
        {/* Username — footprint.onl/________ + state + → */}
        {phase === 'username' && (
          <>
            <div className="flex items-baseline gap-0">
              <span className="font-mono" style={{ fontSize: '16px', fontWeight: 300, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.02em' }}>
                footprint.onl/
              </span>
              <input
                ref={usernameInputRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                autoFocus
                maxLength={30}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                className="font-mono"
                style={{
                  fontSize: '16px',
                  fontWeight: 300,
                  color: usernameColor,
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

            <span
              className="font-mono"
              style={{
                minHeight: '16px',
                fontSize: '11px',
                fontWeight: 400,
                color: statusColor,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {checking ? 'Checking' : statusText}
            </span>

            <span className="font-mono" style={{ fontSize: '13px', fontWeight: 300, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
              {slugState === 'open' ? 'Enter room' : seedPhase === false ? '$10' : 'Claim free'}
            </span>

            <button
              onClick={handleSubmit}
              disabled={!canContinue}
              className="touch-manipulation font-mono"
              aria-label={slugState === 'open' ? 'Open room' : 'Continue'}
              style={{
                background: 'none',
                border: 'none',
                color: canContinue ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
                fontSize: '18px',
                cursor: canContinue ? 'pointer' : 'default',
                padding: '12px',
                transition: 'color 200ms ease',
              }}
              onMouseEnter={(e) => { if (canContinue) e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = canContinue ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)' }}
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
