'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AuthModal from '@/components/auth/AuthModal'

function HomeEntryInner() {
  const searchParams = useSearchParams()
  const authError = searchParams.get('auth_error')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <AuthModal redirectAfterAuth="/home" authError={authError} />
    </div>
  )
}

export default function HomeEntry() {
  return (
    <Suspense>
      <HomeEntryInner />
    </Suspense>
  )
}
