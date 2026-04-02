'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /build — Routing shim.
 *
 * Checks if the logged-in user already has a footprint:
 *   - Yes → redirect to /{slug}/home (their editor)
 *   - No  → redirect to /publish (onboarding + payment)
 *   - Not logged in → redirect to /login
 */
export default function BuildPage() {
  const router = useRouter()

  useEffect(() => {
    async function resolve() {
      try {
        const res = await fetch('/api/footprint-for-user', { credentials: 'include' })

        if (res.ok) {
          const data = await res.json()
          router.replace(`/${data.slug}/home`)
        } else if (res.status === 401) {
          router.replace('/login?redirect=%2Fbuild')
        } else {
          // No footprint yet — go to publish/onboarding
          router.replace('/publish')
        }
      } catch {
        router.replace('/publish')
      }
    }

    resolve()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-void)' }}>
      <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
    </div>
  )
}
