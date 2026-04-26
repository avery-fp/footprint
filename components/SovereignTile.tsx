'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * SovereignTile — "Make yours →" entry into the claim flow.
 *
 * New flow: create an anonymous draft footprint, then navigate the visitor
 * into the draft editor. They build, then claim (entering desired slug) →
 * /api/checkout → Stripe → /{slug}?claimed=true → edit-token cookie set →
 * /{slug}/home.
 *
 * No auth, no session, no Stripe session-id replay. The welcome email
 * carries the permanent edit link for recovery.
 */

interface SovereignTileProps {
  slug: string
  onDismiss: () => void
  onComplete: (slug: string) => void
  sessionId?: string | null
  returnUsername?: string | null
}

export default function SovereignTile({ onDismiss }: SovereignTileProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/draft/create', { method: 'POST' })
        const data = await res.json()
        if (res.ok && data?.tempSlug) {
          window.location.href = `/${data.tempSlug}/home`
          return
        }
        setError(data?.error || 'Could not start a draft')
      } catch {
        setError('Network error — try again')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

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
        {loading && (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#d4c5a9] animate-spin mx-auto mb-6" />
            <p className="text-[15px] text-white/70 font-light">preparing your draft</p>
          </>
        )}
        {error && (
          <>
            <p className="text-[17px] text-white/80 font-light mb-3">{error}</p>
            <button
              onClick={onDismiss}
              className="mt-4 px-5 py-2.5 rounded-lg bg-white/10 text-white/80 text-[13px] hover:bg-white/20 transition-all"
            >
              close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
