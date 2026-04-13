'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AuthModal from '@/components/auth/AuthModal'

function HomeEntryInner() {
  const searchParams = useSearchParams()
  const authError = searchParams.get('auth_error')
  const initialEmail = searchParams.get('email') || undefined

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
        fontFamily: 'inherit',
      }}
    >
      <AuthModal redirectAfterAuth="/home" authError={authError} initialEmail={initialEmail} />
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
