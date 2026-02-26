'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AeInput from '@/components/auth/AeInput'
import AeArrow from '@/components/auth/AeArrow'
import URLPreview from '@/components/auth/URLPreview'
import AeQuietLink from '@/components/auth/AeQuietLink'

type Step = 'username' | 'email' | 'code'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('username')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [reservationToken, setReservationToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')

  // Username availability
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  // Resend state
  const [canResend, setCanResend] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)

  const usernameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-focus on step changes
  useEffect(() => {
    if (step === 'username') {
      setTimeout(() => usernameRef.current?.focus(), 100)
    } else if (step === 'email') {
      setTimeout(() => emailRef.current?.focus(), 250)
    } else if (step === 'code') {
      setTimeout(() => codeRef.current?.focus(), 100)
    }
  }, [step])

  // Resend countdown timer
  useEffect(() => {
    if (step !== 'code') return
    setCanResend(false)
    setResendCountdown(60)

    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          resendIntervalRef.current = null
          setCanResend(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    resendIntervalRef.current = interval

    return () => { clearInterval(interval); resendIntervalRef.current = null }
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
      } else {
        doShake()
      }
    } catch {
      doShake()
    } finally {
      setLoading(false)
    }
  }

  // Step 2 → Step 3: send code
  const handleEmailSubmit = async () => {
    if (!emailArrowVisible || loading) return
    setLoading(true)

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          reservation_token: reservationToken,
        }),
      })

      if (!res.ok) {
        doShake()
      } else {
        setStep('code')
      }
    } catch {
      doShake()
    } finally {
      setLoading(false)
    }
  }

  // Verify code
  const handleCodeSubmit = async () => {
    if (!/^\d{6}$/.test(code) || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      })

      const data = await res.json()

      if (data.success) {
        const dest = data.slug ? `/${data.slug}/home` : '/build'
        window.location.href = dest
      } else {
        setError(data.error || 'invalid code')
        setCode('')
        doShake()
      }
    } catch {
      setError('something went wrong')
      doShake()
    } finally {
      setLoading(false)
    }
  }

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === 6 && /^\d{6}$/.test(code) && !loading) {
      handleCodeSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // Resend code
  const handleResend = async () => {
    if (!canResend || loading) return
    setLoading(true)
    setCanResend(false)
    setResendCountdown(60)

    try {
      await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          reservation_token: reservationToken,
        }),
      })
    } catch {
      // silent
    } finally {
      setLoading(false)
    }

    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          resendIntervalRef.current = null
          setCanResend(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    resendIntervalRef.current = interval
  }

  const doShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  // Get URL preview state
  const urlState: 'available' | 'taken' | 'checking' =
    checking ? 'checking' : available === false ? 'taken' : 'available'

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: '#050505' }}
    >
      <div style={{ width: '100%', maxWidth: '320px' }}
        className={shake ? 'animate-shake' : ''}
      >

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
            <AeInput
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
            <AeArrow
              onClick={handleUsernameSubmit}
              visible={usernameArrowVisible}
              disabled={loading}
            />
          </div>

          {/* sign in link for returning users */}
          <div style={{ marginTop: '48px' }}>
            <AeQuietLink text="already have a room? sign in" onClick={() => { window.location.href = '/login' }} />
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
          {username && (
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
            <AeInput
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
            <AeArrow
              onClick={handleEmailSubmit}
              visible={emailArrowVisible}
              disabled={loading}
            />
          </div>
        </div>

        {/* ── Step 3: Code ── */}
        <div
          style={{
            opacity: step === 'code' ? 1 : 0,
            transform: step === 'code' ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
            position: step === 'code' ? 'relative' : 'absolute',
            pointerEvents: step === 'code' ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          <p style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: '13px',
            textAlign: 'center',
            marginBottom: '24px',
          }}>
            enter the code we sent to {email}
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); handleCodeSubmit() }}
            style={{ width: '100%' }}
          >
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="------"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(v)
                setError('')
              }}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                outline: 'none',
                color: 'rgba(255,255,255,0.9)',
                fontSize: '32px',
                fontFamily: 'monospace',
                letterSpacing: '0.5em',
                textAlign: 'center',
                padding: '12px 0',
                caretColor: 'rgba(255,255,255,0.4)',
              }}
            />
          </form>

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

          <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleResend}
              disabled={!canResend || loading}
              style={{
                background: 'none',
                border: 'none',
                color: canResend ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                fontSize: '13px',
                cursor: canResend ? 'pointer' : 'default',
                padding: '12px',
                transition: 'color 200ms ease',
              }}
              onMouseEnter={(e) => {
                if (canResend) e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = canResend ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'
              }}
            >
              {canResend ? 'resend code' : `resend in ${resendCountdown}s`}
            </button>

            <AeQuietLink text="try different email" onClick={() => { setStep('email'); setEmail(''); setCode(''); setError('') }} />
          </div>
        </div>

      </div>
    </div>
  )
}
