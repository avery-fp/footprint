'use client'

import { useState, useEffect, useRef } from 'react'
import AeInput from '@/components/auth/AeInput'
import AeArrow from '@/components/auth/AeArrow'
import AeQuietLink from '@/components/auth/AeQuietLink'

type Step = 'email' | 'sent'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  // Resend state
  const [canResend, setCanResend] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)

  const emailRef = useRef<HTMLInputElement>(null)
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-focus email input
  useEffect(() => {
    if (step === 'email') {
      setTimeout(() => emailRef.current?.focus(), 100)
    }
  }, [step])

  // Resend countdown timer
  useEffect(() => {
    if (step !== 'sent') return
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
  const arrowVisible = emailValid && !loading

  // Send magic link
  const handleSubmit = async () => {
    if (!emailValid || loading) return
    setLoading(true)

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (!res.ok) {
        setShake(true)
        setTimeout(() => setShake(false), 500)
      } else {
        setStep('sent')
      }
    } catch {
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setLoading(false)
    }
  }

  // Resend magic link
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

  // Go back to email step
  const handleTryDifferent = () => {
    setStep('email')
    setEmail('')
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

        {/* ── Email input ── */}
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
            onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
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
              onClick={handleSubmit}
              visible={arrowVisible}
              disabled={loading}
            />
          </div>

          <div style={{ marginTop: '48px' }}>
            <AeQuietLink text="new here?" onClick={() => { window.location.href = '/signup' }} />
          </div>
        </div>

        {/* ── "check your email" ── */}
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
              {canResend ? 'resend' : `resend in ${resendCountdown}s`}
            </button>

            <AeQuietLink text="try different email" onClick={handleTryDifferent} />
          </div>
        </div>

      </div>
    </div>
  )
}
