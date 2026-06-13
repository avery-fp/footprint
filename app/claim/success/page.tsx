'use client'

import { useEffect, useRef, useState } from 'react'

const DM = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

/**
 * /claim/success?session_id=cs_...
 *
 * Return-from-Stripe waiting room. The Stripe webhook is the minting
 * authority; this page only observes completion, sets the edit-token
 * cookie, and opens the newly claimed room.
 */
export default function ClaimSuccessPage() {
  const [state, setState] = useState<'working' | 'retry' | 'failed'>('working')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const ranRef = useRef(false)

  async function attempt() {
    setState('working')
    setErrorDetail(null)
    const sp = new URLSearchParams(window.location.search)
    const sessionId = sp.get('session_id')
    const slug = sp.get('slug')

    if (!sessionId || !slug) {
      setState('failed')
      setErrorDetail('Missing session_id or slug')
      return
    }

    try {
      for (let attemptIndex = 0; attemptIndex < 8; attemptIndex += 1) {
        if (attemptIndex > 0) await new Promise(r => setTimeout(r, 1500))
        const res = await fetch(`/api/footprint/${encodeURIComponent(slug)}?stripe_session_id=${encodeURIComponent(sessionId)}`)
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.owned && data?.edit_token) {
          await unlockAndRedirect(slug, data.edit_token)
          return
        }
      }
      setState('retry')
      setErrorDetail('webhook_pending')
    } catch (err: any) {
      setState('retry')
      setErrorDetail(err?.message || 'network_error')
    }
  }

  async function unlockAndRedirect(slug: string, editToken: string) {
    try {
      await fetch('/api/edit-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, token: editToken }),
      })
    } catch {
      // Cookie set via fp_edit_{slug} is best-effort here. The editor
      // bootstraps from the in-URL token if present, but we're going
      // there without one — so this fetch should normally succeed.
    }
    window.location.href = `/${slug}?claimed=true`
  }

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    attempt()
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#080808] relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%)',
        }}
      />
      <div className="relative z-10 max-w-sm text-center">
        {state === 'working' && (
          <>
            <div className="w-9 h-9 rounded-full border-2 border-white/10 border-t-[#d4c5a9] animate-spin mx-auto mb-7" />
            <p className="text-[14px] text-white/70 font-light tracking-[-0.01em]" style={{ fontFamily: DM }}>
              claiming your footprint
            </p>
            <p className="text-[12px] text-white/30 mt-3" style={{ fontFamily: MONO }}>
              just a second…
            </p>
          </>
        )}

        {state === 'retry' && (
          <>
            <p className="text-[16px] text-white/80 font-light tracking-[-0.01em] mb-3" style={{ fontFamily: DM }}>
              one more try
            </p>
            <p className="text-[12px] text-white/45 leading-[1.7] mb-7" style={{ fontFamily: MONO }}>
              your payment went through. we just need a moment to finish setting up.
            </p>
            <button
              onClick={attempt}
              className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-[13px] transition"
              style={{ fontFamily: MONO }}
            >
              retry
            </button>
            {errorDetail && (
              <p className="text-[10px] text-white/20 mt-5 font-mono">{errorDetail}</p>
            )}
          </>
        )}

        {state === 'failed' && (
          <>
            <p className="text-[16px] text-white/80 font-light tracking-[-0.01em] mb-3" style={{ fontFamily: DM }}>
              something went wrong
            </p>
            <p className="text-[12px] text-white/45 leading-[1.7]" style={{ fontFamily: MONO }}>
              still preparing your footprint. try again in a moment.
            </p>
            {errorDetail && (
              <p className="text-[10px] text-white/20 mt-5 font-mono">{errorDetail}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
