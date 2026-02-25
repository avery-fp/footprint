'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AEInput from '@/components/auth/AEInput'
import AEArrow from '@/components/auth/AEArrow'
import URLPreview from '@/components/auth/URLPreview'
import AEQuietLink from '@/components/auth/AEQuietLink'

type Step = 'username' | 'email' | 'sent'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('username')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [reservationToken, setReservationToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Username availability
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  // "already have a room?" skips username step
  const [skipUsername, setSkipUsername] = useState(false)

  const usernameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Auto-focus on step changes
  useEffect(() => {
    if (step === 'username') {
      setTimeout(() => usernameRef.current?.focus(), 100)
    } else if (step === 'email') {
      setTimeout(() => emailRef.current?.focus(), 250)
    }
  }, [step])

  // Debounced username availability check (500ms)
  const checkUsername = useCallback(async (value: string) => {
    if (value.length < 3) {
      setAvailable(null)
      return
    }

    setChecking(true)
    try {
      const res = await fetch('/api/auth/username-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: value }),
      })
      const data = await res.json()
      setAvailable(data.available)
    } catch {
      setAvailable(null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username.trim()) checkUsername(username.trim())
    }, 500)
    return () => clearTimeout(timer)
  }, [username, checkUsername])

  // Username validation: 3-20 chars, lowercase alphanumeric + hyphens
  const isUsernameValid = username.length >= 3 && /^[a-z0-9-]+$/.test(username) &&
    !username.startsWith('-') && !username.endsWith('-') && !username.includes('--')

  // Arrow visible when input is non-empty and no invalid characters
  const usernameArrowVisible = isUsernameValid && !loading
  const emailArrowVisible = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !loading

  // Step 1 → Step 2: reserve username
  const handleUsernameSubmit = async () => {
    if (!isUsernameValid || loading) return
    setLoading(true)

    try {
      const res = await fetch('/api/auth/username-reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })
      const data = await res.json()

      if (res.ok && data.reservation_token) {
        setReservationToken(data.reservation_token)
        setStep('email')
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false)
    }
  }

  // Step 2 → Step 3: send magic link
  const handleEmailSubmit = async () => {
    if (!emailArrowVisible || loading) return
    setLoading(true)

    try {
      await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          reservation_token: skipUsername ? undefined : reservationToken,
        }),
      })

      // Always transition to "check your email" regardless of response
      setStep('sent')
    } catch {
      setStep('sent')
    } finally {
      setLoading(false)
    }
  }

  // "already have a room?" — skip to email step
  const handleSkipToEmail = () => {
    setSkipUsername(true)
    setStep('email')
  }

  // Get URL preview state
  const urlState: 'available' | 'taken' | 'checking' =
    checking ? 'checking' : available === false ? 'taken' : 'available'

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: '#050505' }}
    >
      <div style={{ width: '100%', maxWidth: '320px' }}>

        {/* ── Step 1: Username ── */}
        <div
          style={{
            opacity: step === 'username' ? 1 : 0,
            transform: step === 'username' ? 'translateY(0)' : 'translateY(-20px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
            position: step === 'username' ? 'relative' : 'absolute',
            pointerEvents: step === 'username' ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          {/* URL preview */}
          <div style={{ marginBottom: '24px' }}>
            <URLPreview username={username} state={urlState} />
          </div>

          {/* Username input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleUsernameSubmit() }}
            style={{ width: '100%' }}
          >
            <AEInput
              ref={usernameRef}
              placeholder="username"
              value={username}
              onChange={(e) => {
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                if (v.length <= 20) {
                  setUsername(v)
                  setAvailable(null)
                }
              }}
              autoFocus
              autoComplete="off"
            />
          </form>

          {/* Arrow */}
          <div style={{ marginTop: '24px' }}>
            <AEArrow
              onClick={handleUsernameSubmit}
              visible={usernameArrowVisible}
              disabled={loading}
            />
          </div>

          {/* "already have a room?" */}
          <div style={{ marginTop: '48px' }}>
            <AEQuietLink text="already have a room?" onClick={handleSkipToEmail} />
          </div>
        </div>

        {/* ── Step 2: Email ── */}
        <div
          style={{
            opacity: step === 'email' ? 1 : 0,
            transform: step === 'email' ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
            position: step === 'email' ? 'relative' : 'absolute',
            pointerEvents: step === 'email' ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          {/* URL preview (quiet, if we have a username) */}
          {!skipUsername && username && (
            <div style={{ marginBottom: '32px' }}>
              <p style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: 'rgba(255,255,255,0.2)',
                letterSpacing: '0.02em',
              }}>
                footprint.onl/{username}
              </p>
            </div>
          )}

          {/* Email input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleEmailSubmit() }}
            style={{ width: '100%' }}
          >
            <AEInput
              ref={emailRef}
              placeholder="your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
            />
          </form>

          {/* Arrow */}
          <div style={{ marginTop: '24px' }}>
            <AEArrow
              onClick={handleEmailSubmit}
              visible={emailArrowVisible}
              disabled={loading}
            />
          </div>
        </div>

        {/* ── Step 3: "check your email" ── */}
        <div
          style={{
            opacity: step === 'sent' ? 1 : 0,
            transform: step === 'sent' ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
            position: step === 'sent' ? 'relative' : 'absolute',
            pointerEvents: step === 'sent' ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          <p style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: '16px',
            textAlign: 'center',
          }}>
            check your email
          </p>
        </div>

      </div>
    </div>
  )
}
