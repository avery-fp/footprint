'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const DM = "'DM Sans', sans-serif"
const paymentLink = 'https://buy.stripe.com/9B6cN40Ef0sG2z98b214400'

/**
 * NOT FOUND PAGE — with auth guard
 *
 * Prevents the "unclaimed" flash for authenticated owners:
 * 1. While auth is loading → show blank/spinner (not the unclaimed page)
 * 2. If logged-in user's slug matches the current path → redirect to /[slug]/home
 * 3. Otherwise → show the standard unclaimed page
 */
export default function NotFound() {
  const pathname = usePathname()
  const [authState, setAuthState] = useState<'loading' | 'owner' | 'not-owner'>('loading')

  useEffect(() => {
    // Extract slug from path: /username → username, /username/fp → username
    const segments = pathname?.split('/').filter(Boolean)
    const pathSlug = segments?.[0]

    if (!pathSlug) {
      // Root-level not-found — no slug to match
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
          if (data.slug && data.slug === pathSlug) {
            // Owner visiting their own unpublished page → redirect to editor
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
  }, [pathname])

  // While auth is loading, show blank screen (no flash of unclaimed content)
  if (authState === 'loading' || authState === 'owner') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080808]">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
      </div>
    )
  }

  // Auth resolved — not the owner, show unclaimed page
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#080808]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      <div className="max-w-md text-center">
        <p
          className="text-white/12 text-[10px] tracking-[0.3em] uppercase mb-10"
          style={{ fontFamily: DM }}
        >
          unclaimed
        </p>

        <h1
          className="text-white mb-4"
          style={{
            fontFamily: DM,
            fontSize: '36px',
            fontWeight: 300,
            letterSpacing: '-0.03em',
          }}
        >
          this page doesn&apos;t exist yet
        </h1>

        <p
          className="text-white/25 text-sm mb-14 leading-relaxed"
          style={{ fontFamily: DM }}
        >
          one page for everything.
        </p>

        <div className="flex items-center justify-center gap-5">
          <a
            href={paymentLink}
            className="rounded-full px-8 py-3 bg-white text-black/90 hover:bg-white/90 transition-all duration-200 text-sm font-medium"
            style={{ fontFamily: DM }}
          >
            get yours
          </a>

          <Link
            href="/ae"
            className="text-white/20 hover:text-white/40 transition-colors duration-300 text-sm"
            style={{ fontFamily: DM }}
          >
            see one
          </Link>
        </div>
      </div>
    </div>
  )
}
