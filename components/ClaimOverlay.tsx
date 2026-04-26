'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * ClaimOverlay — renders on /{slug}?claimed=true&session_id=... after a
 * successful Stripe checkout redirect.
 *
 * Polls /api/footprint/{slug}?stripe_session_id=... every 2s (up to 30s).
 * When edit_token arrives:
 *   1. POST /api/edit-unlock to set the fp_edit_{slug} cookie.
 *   2. Navigate to /{slug}/home (editor). Token is never persisted to URL.
 *
 * If the 30s window elapses: show "check your email" — the welcome email
 * carries the permanent edit link.
 */
export default function ClaimOverlay({ slug }: { slug: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const isClaim = params.get('claimed') === 'true'
  const sessionId = params.get('session_id')

  const [state, setState] = useState<'idle' | 'polling' | 'elapsed' | 'error'>(
    isClaim ? 'polling' : 'idle'
  )
  const attempts = useRef(0)

  useEffect(() => {
    if (!isClaim || !sessionId) return

    let cancelled = false
    const maxAttempts = 15
    const intervalMs = 2000

    async function tick() {
      if (cancelled) return
      attempts.current += 1

      try {
        const res = await fetch(
          `/api/footprint/${encodeURIComponent(slug)}?stripe_session_id=${encodeURIComponent(sessionId || '')}`,
          { cache: 'no-store' }
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (data?.edit_token) {
          const unlock = await fetch('/api/edit-unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, token: data.edit_token }),
          })
          if (unlock.ok) {
            router.replace(`/${slug}/home`)
            return
          }
        }
      } catch {
        // transient — keep polling until elapsed
      }

      if (cancelled) return
      if (attempts.current >= maxAttempts) {
        setState('elapsed')
        return
      }
      setTimeout(tick, intervalMs)
    }

    tick()
    return () => { cancelled = true }
  }, [isClaim, sessionId, slug, router])

  if (!isClaim) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: 'radial-gradient(circle at center, rgba(12,12,16,0.92), rgba(12,12,16,0.98))',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div className="text-center px-8 max-w-sm">
        {state === 'polling' && (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#d4c5a9] animate-spin mx-auto mb-6" />
            <p className="text-[15px] text-white/70 font-light tracking-[-0.01em]">
              claiming footprint.onl/{slug}
            </p>
            <p className="text-[12px] text-white/30 mt-3 font-mono">
              just a second…
            </p>
          </>
        )}

        {state === 'elapsed' && (
          <>
            <p className="text-[17px] text-white/80 font-light tracking-[-0.01em] mb-3">
              still preparing your footprint
            </p>
            <p className="text-[13px] text-white/50 leading-[1.7]">
              try again in a moment.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-8 px-5 py-2.5 rounded-lg bg-white/10 text-white/80 text-[13px] hover:bg-white/20 transition-all"
            >
              try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
