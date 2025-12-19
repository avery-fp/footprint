'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * Magic Link Verification Page
 * 
 * User lands here after clicking the magic link in their email.
 * We verify the token and create a session if valid.
 */
export default function VerifyPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const token = searchParams.get('token')
  const redirect = searchParams.get('redirect') || '/dashboard'
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('No token provided')
      return
    }

    async function verify() {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await res.json()

        if (data.success) {
          setStatus('success')
          // Redirect after a brief moment to show success
          setTimeout(() => {
            router.push(redirect)
          }, 1500)
        } else {
          setStatus('error')
          setError(data.error || 'Invalid or expired link')
        }
      } catch (err) {
        setStatus('error')
        setError('Verification failed')
      }
    }

    verify()
  }, [token, redirect, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm text-center">
        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <span className="text-2xl">◈</span>
            </div>
            <h1 className="text-2xl font-light mb-4">Verifying...</h1>
            <p className="text-white/50">Checking your magic link</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-400 flex items-center justify-center mx-auto mb-6 animate-pop-in">
              <span className="text-2xl text-ink">✓</span>
            </div>
            <h1 className="text-2xl font-light mb-4">You're in!</h1>
            <p className="text-white/50">Redirecting you now...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-400/20 flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl">✕</span>
            </div>
            <h1 className="text-2xl font-light mb-4">Link expired</h1>
            <p className="text-white/50 mb-8">{error}</p>
            <Link 
              href="/auth/login"
              className="btn-primary inline-block rounded-lg"
            >
              Try again
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
