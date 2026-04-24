'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const DM = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

/**
 * Unclaimed-slug page.
 *
 * Two cases:
 *
 * 1. Visitor lands on an unclaimed slug → soft "this footprint hasn't been
 *    claimed" page with a quiet CTA.
 *
 * 2. Owner just paid — URL has ?claimed=true or ?session_id=... but the
 *    webhook hasn't promoted the draft yet. Poll /api/footprint/{slug}
 *    every 2s for up to 30s; on success cookie the edit_token and bounce
 *    to /{slug}/home. Never show the "claim this page" CTA to a paying
 *    customer.
 */
export default function NotFound() {
  const pathname = usePathname()
  const segments = pathname?.split('/').filter(Boolean)
  const displaySlug = segments?.[0] || ''

  // Read post-payment params from window. useSearchParams() in not-found.tsx
  // forces a Suspense boundary at build time; window.location is dynamic and
  // safe inside useEffect/handlers.
  const [isClaiming, setIsClaiming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const claiming = sp.get('claimed') === 'true' || !!sp.get('session_id')
    setIsClaiming(claiming)
    setSessionId(sp.get('session_id'))
  }, [])

  const [pollState, setPollState] = useState<'polling' | 'elapsed'>('polling')
  const [visible, setVisible] = useState(false)
  const [claimLoading, setClaimLoading] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  // Owner with edit-token cookie → bounce to editor.
  useEffect(() => {
    if (!displaySlug || isClaiming) return
    const hasEditCookie = document.cookie.split('; ').some(c => c.startsWith(`fp_edit_${displaySlug}=`))
    if (hasEditCookie) {
      window.location.href = `/${displaySlug}/home`
    }
  }, [displaySlug, isClaiming])

  // Post-payment polling: webhook may not have completed yet.
  useEffect(() => {
    if (!isClaiming || !displaySlug) return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 15
    const intervalMs = 2000

    async function tick() {
      if (cancelled) return
      attempts += 1

      try {
        const url = sessionId
          ? `/api/footprint/${encodeURIComponent(displaySlug)}?stripe_session_id=${encodeURIComponent(sessionId)}`
          : `/api/footprint/${encodeURIComponent(displaySlug)}`
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (data?.edit_token) {
          const unlock = await fetch('/api/edit-unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: displaySlug, token: data.edit_token }),
          })
          if (unlock.ok) {
            window.location.href = `/${displaySlug}/home`
            return
          }
        }
      } catch {
        // transient; keep polling
      }

      if (cancelled) return
      if (attempts >= maxAttempts) {
        setPollState('elapsed')
        return
      }
      setTimeout(tick, intervalMs)
    }

    tick()
    return () => { cancelled = true }
  }, [isClaiming, displaySlug, sessionId])

  // Staggered entrance
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  // ── Post-payment polling view ──
  if (isClaiming) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#080808] relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-sm text-center">
          {pollState === 'polling' ? (
            <>
              <div className="w-9 h-9 rounded-full border-2 border-white/10 border-t-[#d4c5a9] animate-spin mx-auto mb-7" />
              <p className="text-[14px] text-white/70 font-light tracking-[-0.01em]" style={{ fontFamily: DM }}>
                claiming footprint.onl/{displaySlug}
              </p>
              <p className="text-[12px] text-white/30 mt-3" style={{ fontFamily: MONO }}>
                just a second…
              </p>
            </>
          ) : (
            <>
              <p className="text-[16px] text-white/80 font-light tracking-[-0.01em] mb-3" style={{ fontFamily: DM }}>
                your footprint is on its way
              </p>
              <p className="text-[12px] text-white/45 leading-[1.7]" style={{ fontFamily: MONO }}>
                check your email — your permanent edit link is coming through.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-7 px-5 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/70 text-[12px] transition"
                style={{ fontFamily: MONO }}
              >
                try again
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Unclaimed-slug visitor view ──
  const handleClaim = async () => {
    if (claimLoading) return
    setClaimLoading(true)
    setClaimError(null)
    try {
      const res = await fetch('/api/draft/create', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.tempSlug) {
        window.location.href = `/${data.tempSlug}/home`
        return
      }
      setClaimError(data?.error || 'could not start — try again')
    } catch {
      setClaimError('network error — try again')
    } finally {
      setClaimLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#080808] relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.025) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-sm text-center">
        <p
          className="transition-all duration-700 ease-out"
          style={{
            fontFamily: MONO,
            fontSize: '12px',
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.30)',
            marginBottom: '20px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(6px)',
          }}
        >
          footprint.onl/{displaySlug}
        </p>

        <p
          className="transition-all duration-700 ease-out"
          style={{
            fontFamily: DM,
            fontSize: '15px',
            fontWeight: 300,
            letterSpacing: '-0.005em',
            color: 'rgba(255,255,255,0.70)',
            lineHeight: 1.5,
            marginBottom: '28px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(6px)',
            transitionDelay: '120ms',
          }}
        >
          This footprint hasn&rsquo;t been claimed yet.
        </p>

        <div
          className="flex flex-col items-center gap-4 transition-all duration-700 ease-out"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(6px)',
            transitionDelay: '280ms',
          }}
        >
          <button
            type="button"
            onClick={handleClaim}
            disabled={claimLoading}
            className="text-white/70 hover:text-white/95 transition-colors duration-200 text-[14px] disabled:opacity-50 disabled:cursor-default"
            style={{ fontFamily: DM, background: 'none', border: 'none', cursor: claimLoading ? 'default' : 'pointer' }}
          >
            {claimLoading ? 'preparing…' : 'make yours →'}
          </button>

          {claimError && (
            <p
              className="text-red-400/70 text-[11px]"
              style={{ fontFamily: MONO, letterSpacing: '0.02em' }}
            >
              {claimError}
            </p>
          )}

          <Link
            href="/ae"
            className="text-white/20 hover:text-white/45 transition-colors duration-300 text-[12px]"
            style={{ fontFamily: DM }}
          >
            see example
          </Link>
        </div>
      </div>
    </div>
  )
}
