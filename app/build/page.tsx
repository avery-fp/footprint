'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /build — redirects authenticated users to their editor.
 *
 * Fetches the user's primary footprint slug, then redirects to /{slug}/home.
 * If not authenticated, redirects to /signup.
 */
export default function BuildPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    async function redirect() {
      try {
        // Fetch user's primary footprint (returns 401 if not authenticated)
        const fpRes = await fetch('/api/footprint-for-user')
        if (fpRes.status === 401) {
          router.push('/signup')
          return
        }
        if (fpRes.ok) {
          const data = await fpRes.json()
          if (data.slug) {
            router.push(`/${data.slug}/home`)
            return
          }
        }

        setError('No page found. Try signing up again.')
      } catch {
        router.push('/signup')
      }
    }

    redirect()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-white/30 text-[13px]">{error}</p>
        <a
          href="/signup"
          className="py-3 px-6 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all"
        >
          sign up
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
    </div>
  )
}
