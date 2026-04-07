'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ClaimCeremony from '@/components/ClaimCeremony'
import AuthModal from '@/components/auth/AuthModal'

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

export default function SovereignTile({ slug, onDismiss, onComplete }: SovereignTileProps) {
  const [phase, setPhase] = useState<Phase>('init')
  const [username, setUsername] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serial, setSerial] = useState<number | null>(null)
  const [finalSlug, setFinalSlug] = useState('')
  const [seedPhase, setSeedPhase] = useState<boolean | null>(null)
  const finalizeCalledRef = useRef(false)

  // ── ONE init effect — replaces 5 racing effects ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const returnUsername = params.get('username')

    // Fetch seed phase status in parallel — UI uses it to hide $10
    fetch('/api/publish/phase')
      .then(r => r.ok ? r.json() : { seedPhase: false })
      .then(data => setSeedPhase(data.seedPhase === true))
      .catch(() => setSeedPhase(false))

    // URL already cleaned by PublicPage — just check auth and decide phase
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

  // OAuth, passkey, and email magic-link are all handled inside <AuthModal />
  // (which delegates to OAuthButton + PasskeyButton). The redirectAfterAuth
  // path is set as `/${slug}?claim=1` below so users land back on the claim
  // flow with their session cookie set.

  // ── Submit username → seed (instant) or paid (Stripe) ──
  const handleSubmit = useCallback(async () => {
    if (!available || loading || !username) return
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

  // ── Auth phase — render the unified AuthModal ──
  if (phase === 'auth') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ pointerEvents: 'auto' }}
        onClick={onDismiss}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <AuthModal
            redirectAfterAuth={`/${slug}?claim=1`}
            showPrice={seedPhase === false}
            onClose={onDismiss}
          />
        </div>
      </div>
    )
  }

  // ── Username / processing — original tile chrome ──
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
        {/* Username — fp.onl/________ + (optional $10) + → */}
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

            {seedPhase === false && (
              <span className="font-mono" style={{ fontSize: '13px', fontWeight: 300, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
                $10
              </span>
            )}

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
