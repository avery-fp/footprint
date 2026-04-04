'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const DM = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

/**
 * NOT FOUND → $10 CLAIM PAGE
 *
 * When someone visits an unclaimed slug (fp.onl/john), show a compelling
 * claim page with the slug, price, and CTA.
 *
 * Auth guard prevents flash for owners of unpublished pages.
 */
export default function NotFound() {
  const pathname = usePathname()
  const [authState, setAuthState] = useState<'loading' | 'owner' | 'not-owner'>('loading')
  const [price, setPrice] = useState('$10')
  const [visible, setVisible] = useState(false)

  // Extract slug from path
  const segments = pathname?.split('/').filter(Boolean)
  const displaySlug = segments?.[0] || ''

  // Auth guard — redirect owners to their editor
  useEffect(() => {
    if (!displaySlug) {
      setAuthState('not-owner')
      return
    }

    let cancelled = false

    async function checkAuth() {
      try {
        const res = await fetch('/api/footprint-for-user', { credentials: 'include' })
        if (cancelled) return

        if (res.ok) {
          const data = await res.json()
          if (data.slug && data.slug === displaySlug) {
            window.location.href = `/${data.slug}/home`
            return
          }
        }
      } catch {
        // Auth check failed — fall through to unclaimed
      }

      if (!cancelled) {
        setAuthState('not-owner')
      }
    }

    checkAuth()
    return () => { cancelled = true }
  }, [displaySlug])

  // Geo pricing
  useEffect(() => {
    fetch('/api/geo')
      .then(r => r.json())
      .then(d => { if (d.price) setPrice(d.price) })
      .catch(() => {})
  }, [])

  // Staggered entrance
  useEffect(() => {
    if (authState === 'not-owner') {
      const t = setTimeout(() => setVisible(true), 100)
      return () => clearTimeout(t)
    }
  }, [authState])

  // Loading / owner redirect
  if (authState === 'loading' || authState === 'owner') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080808]">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
      </div>
    )
  }

  // Build CTA href — auth-aware routing
  const hasSession = typeof document !== 'undefined' && document.cookie.includes('fp_session')
  const claimHref = hasSession
    ? `/claim?username=${displaySlug}`
    : `/login?redirect=${encodeURIComponent(`/claim?username=${displaySlug}`)}`

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#080808] relative overflow-hidden">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-md text-center">
        {/* Slug display */}
        <p
          className="transition-all duration-700 ease-out"
          style={{
            fontFamily: MONO,
            fontSize: '13px',
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.35)',
            marginBottom: '20px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
          }}
        >
          fp.onl/{displaySlug}
        </p>

        {/* Price — the anchor */}
        <p
          className="transition-all duration-700 ease-out"
          style={{
            fontFamily: DM,
            fontSize: 'clamp(40px, 8vw, 56px)',
            fontWeight: 300,
            letterSpacing: '-0.02em',
            color: 'rgba(255,255,255,0.9)',
            lineHeight: 1,
            marginBottom: '12px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transitionDelay: '150ms',
          }}
        >
          {price}
        </p>

        {/* Tagline */}
        <p
          className="transition-all duration-700 ease-out"
          style={{
            fontFamily: DM,
            fontSize: '15px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.18)',
            marginBottom: '48px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transitionDelay: '300ms',
          }}
        >
          permanent.
        </p>

        {/* CTA */}
        <div
          className="flex flex-col items-center gap-5 transition-all duration-700 ease-out"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transitionDelay: '450ms',
          }}
        >
          <a
            href={claimHref}
            className="rounded-full px-8 py-3 bg-white text-black/90 hover:bg-white/90 transition-all duration-200 text-sm font-medium"
            style={{ fontFamily: DM }}
          >
            claim this page
          </a>

          <Link
            href="/ae"
            className="text-white/15 hover:text-white/35 transition-colors duration-300 text-sm"
            style={{ fontFamily: DM }}
          >
            see one
          </Link>
        </div>
      </div>
    </div>
  )
}
