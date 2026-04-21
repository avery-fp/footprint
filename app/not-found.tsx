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
  const [authState, setAuthState] = useState<'loading' | 'owner' | 'not-owner'>('not-owner')
  const [price, setPrice] = useState('$10')
  const [visible, setVisible] = useState(false)

  // Extract slug from path
  const segments = pathname?.split('/').filter(Boolean)
  const displaySlug = segments?.[0] || ''

  // Owner detection via edit-token cookie: if fp_edit_{slug} is present,
  // the cookie is HttpOnly and can't be read here, so we bounce to the
  // editor which will validate (or redirect back to /{slug}).
  useEffect(() => {
    if (!displaySlug) return
    // If the user holds an edit token for this slug they'll want the editor;
    // if not, the editor will bounce them right back to /{slug}. Either way
    // a single hop resolves it.
    const hasEditCookie = document.cookie.split('; ').some(c => c.startsWith(`fp_edit_${displaySlug}=`))
    if (hasEditCookie) {
      window.location.href = `/${displaySlug}/home`
    }
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

  // Claim CTA lands on /ae (the showcase room). From there, "Make yours →"
  // opens the anonymous build flow that ends with a /api/checkout call.
  const claimHref = '/ae'

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
