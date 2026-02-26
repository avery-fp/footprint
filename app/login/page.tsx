'use client'

import { useState, useEffect, useRef } from 'react'
import AeInput from '@/components/auth/AeInput'
import AeArrow from '@/components/auth/AeArrow'
import AeQuietLink from '@/components/auth/AeQuietLink'

type Step = 'email' | 'code'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')

  // Resend state
  const [canResend, setCanResend] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)

  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-focus
  useEffect(() => {
    if (step === 'email') {
      setTimeout(() => emailRef.current?.focus(), 100)
    } else if (step === 'code') {
      setTimeout(() => codeRef.current?.focus(), 100)
    }
  }, [step])

  // Resend countdown
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

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  // Send code
  const handleEmailSubmit = async () => {
    if (!emailValid || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
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

  // Resend
  const handleResend = async () => {
    if (!canResend || loading) return
    setLoading(true)
    setCanResend(false)
    setResendCountdown(60)

    try {
      await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
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

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: '#050505' }}
    >
      <div
        style={{ width: '100%', maxWidth: '320px' }}
        className={shake ? 'animate-shake' : ''}
      >

        {/* ── Email step ── */}
        <div
          style={{
            opacity: step === 'email' ? 1 : 0,
            transform: step === 'email' ? 'translateY(0)' : 'translateY(-20px)',
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
              autoFocus
            />
          </form>

          <div style={{ marginTop: '24px' }}>
            <AeArrow
              onClick={handleEmailSubmit}
              visible={emailValid && !loading}
              disabled={loading}
            />
          </div>

          <div style={{ marginTop: '48px' }}>
            <AeQuietLink text="new here?" onClick={() => { window.location.href = '/signup' }} />
          </div>
        </div>

        {/* ── Code step ── */}
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
