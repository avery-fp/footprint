'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import AeInput from '@/components/auth/AeInput'
import AeArrow from '@/components/auth/AeArrow'
import AeQuietLink from '@/components/auth/AeQuietLink'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')

  const emailRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')

  useEffect(() => {
    setTimeout(() => emailRef.current?.focus(), 100)
  }, [])

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const formValid = emailValid && password.length >= 6

  const handleSubmit = async () => {
    if (!formValid || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const data = await res.json()

      if (data.success) {
        const dest = redirectTo || '/dashboard'
        window.location.href = dest
      } else {
        setError(data.error || 'invalid email or password')
        doShake()
      }
    } catch {
      setError('something went wrong')
      doShake()
    } finally {
      setLoading(false)
    }
  }

  const doShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const handleGoogleSignIn = async () => {
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google' }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
        return
      }

      setError(data.error || 'google sign-in failed')
      doShake()
    } catch {
      setError('google sign-in failed')
      doShake()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: '#050505' }}
    >
      <div
        style={{ width: '100%', maxWidth: '320px' }}
        className={shake ? 'animate-shake' : ''}
      >
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="touch-manipulation"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            padding: '14px 20px',
            marginBottom: '18px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '8px',
            color: 'rgba(255,255,255,0.85)',
            fontSize: '14px',
            fontFamily: 'inherit',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <AeInput
            ref={emailRef}
            placeholder="your email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            type="email"
            autoComplete="email"
            autoFocus
          />

          <div style={{ width: '100%', marginTop: '16px' }}>
            <AeInput
              placeholder="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              type="password"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p style={{
              color: 'rgba(255,100,100,0.7)',
              fontSize: '13px',
              marginTop: '12px',
              textAlign: 'center',
            }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: '24px' }}>
            <AeArrow
              onClick={handleSubmit}
              visible={formValid && !loading}
              disabled={loading}
            />
          </div>
        </form>

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <AeQuietLink text="new here?" onClick={() => { window.location.href = '/signup' }} />
        </div>
      </div>
    </div>
  )
}
