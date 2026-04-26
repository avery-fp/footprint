'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const DM = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

/**
 * Unclaimed-slug page.
 *
 * If the URL carries a session_id (post-payment redirect that landed
 * here because the slug isn't published yet) we send the user straight
 * to /claim/success — that route owns the synchronous claim path and
 * we don't want to flash the visitor copy at a paying customer.
 *
 * If an owner with an edit-token cookie hits this page (slug isn't
 * published yet, but they hold the token), we bounce them to /home.
 *
 * Otherwise: soft "not claimed yet" copy with a quiet 'make yours →'.
 */
export default function NotFound() {
  const pathname = usePathname()
  const segments = pathname?.split('/').filter(Boolean)
  const displaySlug = segments?.[0] || ''

  const [visible, setVisible] = useState(false)
  const [claimLoading, setClaimLoading] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  // Post-payment hijack: if we have a session_id, /claim/success handles it.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const sessionId = sp.get('session_id')
    if (sessionId) {
      window.location.replace(`/claim/success?session_id=${encodeURIComponent(sessionId)}`)
    }
  }, [])

  // Owner with edit-token cookie → bounce to editor.
  useEffect(() => {
    if (!displaySlug) return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('session_id')) return
    const hasEditCookie = document.cookie.split('; ').some(c => c.startsWith(`fp_edit_${displaySlug}=`))
    if (hasEditCookie) {
      window.location.href = `/${displaySlug}/home`
    }
  }, [displaySlug])

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

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
