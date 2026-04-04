'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * /publish — backward-compat redirect to /claim.
 * Preserves query params (session_id, username) for Stripe return flow.
 */
export default function PublishRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const params = searchParams.toString()
    router.replace(`/claim${params ? `?${params}` : ''}`)
  }, [router, searchParams])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-void, #050505)' }}
    >
      <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
    </div>
  )
}
