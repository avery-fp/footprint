'use client'

import { useEffect, useRef, useState } from 'react'

const DM = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

/**
 * /claim/success?session_id=cs_...
 *
 * The synchronous return-from-Stripe path. POSTs to /api/claim/complete
 * which retrieves the session server-side, verifies it's paid, and
 * promotes the draft into a claimed footprint. Then cookies the
 * edit_token via /api/edit-unlock and bounces to /{slug}/home.
 *
 * Webhook signature/config no longer blocks the user — webhook is just
 * a backup that runs the same shared logic.
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

    if (!sessionId) {
      setState('failed')
      setErrorDetail('Missing session_id')
      return
    }

    try {
      const res = await fetch('/api/claim/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 402) {
        // Stripe says session isn't paid yet — rare, but retry once.
        await new Promise(r => setTimeout(r, 2000))
        const retry = await fetch('/api/claim/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const retryData = await retry.json().catch(() => ({}))
        if (!retry.ok || !retryData?.slug) {
          setState('retry')
          setErrorDetail(retryData?.error || 'payment_not_yet_confirmed')
          return
        }
        await unlockAndRedirect(retryData.slug, retryData.edit_token)
        return
      }

      if (!res.ok || !data?.slug) {
        setState('retry')
        setErrorDetail(data?.error || `HTTP ${res.status}`)
        return
      }

      await unlockAndRedirect(data.slug, data.edit_token)
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
    window.location.href = `/${slug}/home?claimed=true`
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
              your payment is recorded. check your email for your edit link.
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
