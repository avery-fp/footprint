'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * DraftClaimForm — inline claim sheet on a draft footprint.
 *
 * Triggered by the ClaimPlaque in the top-right of the draft chrome.
 * Collects the desired permanent username and email, then POSTs
 * /api/checkout with { draft_slug, desired_slug, email }. Stripe
 * success/webhook authority completes the deed.
 */

interface DraftClaimFormProps {
  draftSlug: string
  onClose: () => void
}

const SLUG_RE = /^[a-z0-9-]{1,40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeSlug(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '-')
}

export default function DraftClaimForm({ draftSlug, onClose }: DraftClaimFormProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => usernameRef.current?.focus(), 80)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const desired = normalizeSlug(username)
  const usernameValid = SLUG_RE.test(desired) && !desired.startsWith('draft-')
  const emailValid = EMAIL_RE.test(email.trim())
  const canSubmit = usernameValid && availability === 'available' && emailValid && !busy

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('fp:draft-slug-preview', {
      detail: { slug: desired, available: availability === 'available' },
    }))
  }, [desired, availability])

  useEffect(() => {
    if (!desired || !usernameValid) {
      setAvailability('idle')
      return
    }
    setAvailability('checking')
    const controller = new AbortController()
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/check-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: desired }),
          signal: controller.signal,
        })
        const data = await res.json().catch(() => ({}))
        setAvailability(data?.available ? 'available' : 'taken')
      } catch {
        if (!controller.signal.aborted) setAvailability('taken')
      }
    }, 220)
    return () => {
      controller.abort()
      clearTimeout(id)
    }
  }, [desired, usernameValid])

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_slug: draftSlug,
          desired_slug: desired,
          email: email.trim().toLowerCase(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.url) {
        window.location.href = data.url
        return
      }
      setError(data?.error || 'Could not start checkout — try again.')
    } catch {
      setError('Network error — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-6"
      style={{
        background: 'radial-gradient(circle at center, rgba(8,8,10,0.88), rgba(8,8,10,0.96))',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div
        className="w-full max-w-sm"
        style={{
          background: 'rgba(14,14,16,0.92)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 16,
          padding: '24px 22px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <span
            className="font-mono lowercase"
            style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.45)' }}
          >
            go live
          </span>
          <button
            type="button"
            aria-label="close"
            onClick={() => { if (!busy) onClose() }}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: busy ? 'default' : 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <label className="block mb-4">
          <span
            className="font-mono lowercase block mb-1.5"
            style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}
          >
            footprint.onl /
          </span>
          <input
            ref={usernameRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            disabled={busy}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'rgba(255,255,255,0.92)',
              fontSize: 15,
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </label>

        {desired && usernameValid && (
          <p
            className="font-mono"
            style={{
              fontSize: 10,
              color: availability === 'available'
                ? 'rgba(200,235,190,0.62)'
                : availability === 'taken'
                  ? 'rgba(220,90,90,0.75)'
                  : 'rgba(255,255,255,0.35)',
              margin: '-6px 0 14px 0',
              letterSpacing: '0.08em',
              textTransform: 'lowercase',
            }}
          >
            {availability === 'available' ? 'available' : availability === 'taken' ? 'taken' : 'checking'}
          </p>
        )}

        <label className="block mb-5">
          <span
            className="font-mono lowercase block mb-1.5"
            style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}
          >
            email
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            disabled={busy}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'rgba(255,255,255,0.92)',
              fontSize: 15,
              outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </label>

        {error && (
          <p
            className="font-mono"
            style={{ fontSize: 11, color: 'rgba(220,90,90,0.85)', marginBottom: 12, lineHeight: 1.5 }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            width: '100%',
            background: canSubmit ? 'rgba(255,244,224,0.10)' : 'rgba(255,244,224,0.04)',
            color: canSubmit ? 'rgba(255,244,224,0.92)' : 'rgba(255,244,224,0.35)',
            border: '1px solid rgba(255,244,224,0.14)',
            borderRadius: 999,
            padding: '11px 18px',
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.04em',
            cursor: canSubmit ? 'pointer' : 'default',
            transition: 'background 180ms ease, color 180ms ease',
          }}
        >
          {busy ? 'preparing checkout…' : 'claim → $10'}
        </button>

        <p
          className="font-mono text-center"
          style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 14, lineHeight: 1.5 }}
        >
          permanent. one-time. yours forever.
        </p>
      </div>
    </div>
  )
}
