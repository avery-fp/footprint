'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /build — post-signup landing for users without a slug yet.
 * Redirects to /publish where they claim a username and go live.
 */
export default function BuildPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/publish')
  }, [router])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-void, #050505)' }}
    >
      <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
      <p className="mt-4 text-white/30 text-[13px] font-mono">loading...</p>
    </div>
  )
}
