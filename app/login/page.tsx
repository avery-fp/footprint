'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import AeInput from '@/components/auth/AeInput'
import AeArrow from '@/components/auth/AeArrow'
import AeQuietLink from '@/components/auth/AeQuietLink'
import OAuthButton from '@/components/auth/OAuthButton'
import Divider from '@/components/auth/Divider'

type Mode = 'choose' | 'password' | 'magic-link'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')
  const [magicSent, setMagicSent] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const urlError = searchParams.get('error')

  useEffect(() => {
    if (urlError) setError(urlError)
  }, [urlError])

  useEffect(() => {
    setTimeout(() => emailRef.current?.focus(), 100)
  }, [])

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const doShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  // ── Password login ──
  const handlePasswordLogin = async () => {
    if (!emailValid || password.length < 6 || loading) return
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
        window.location.href = redirectTo || '/dashboard'
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

  // ── Magic link ──
  const handleMagicLink = async () => {
    if (!emailValid || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()

      if (data.success) {
        setMagicSent(true)
      } else {
        setError(data.error || 'failed to send link')
        doShake()
      }
    } catch {
      setError('something went wrong')
      doShake()
    } finally {
      setLoading(false)
    }
  }

  // ── Passkey login ──
  const handlePasskey = async () => {
    if (loading) return
    setLoading(true)
    setError('')

    try {
      // Step 1: Get options
      const optRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options', email: email.trim() || undefined }),
      })
      const options = await optRes.json()
      if (options.error) {
        setError(options.error)
        doShake()
        return
      }

      // Step 2: Browser WebAuthn ceremony
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const assertion = await startAuthentication({ optionsJSON: options })

      // Step 3: Verify
      const verifyRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          response: assertion,
          challenge: options.challenge,
        }),
      })
      const result = await verifyRes.json()

      if (result.success) {
        window.location.href = redirectTo || '/dashboard'
      } else {
        setError(result.error || 'passkey verification failed')
        doShake()
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('passkey cancelled')
      } else {
        setError('passkey auth failed')
      }
      doShake()
    } finally {
      setLoading(false)
    }
  }

  // ── Magic link sent state ──
  if (magicSent) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6" style={{ background: '#050505' }}>
        <div style={{ width: '100%', maxWidth: '320px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', lineHeight: '1.6' }}>
            check your email
          </p>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '12px', lineHeight: '1.6' }}>
            we sent an entry link to {email}
          </p>
          <div style={{ marginTop: '48px' }}>
            <AeQuietLink text="try another way" onClick={() => { setMagicSent(false); setMode('choose') }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6" style={{ background: '#050505' }}>
      <div style={{ width: '100%', maxWidth: '320px' }} className={shake ? 'animate-shake' : ''}>

        {/* OAuth buttons — always visible */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <OAuthButton provider="google" label="continue with Google" />
          <OAuthButton provider="apple" label="continue with Apple" />
        </div>

        <Divider />

        {/* Email input — always visible */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (mode === 'password') handlePasswordLogin()
            else if (mode === 'magic-link') handleMagicLink()
            else if (emailValid) setMode('magic-link')
          }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '20px' }}
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

          {mode === 'password' && (
            <div style={{ width: '100%', marginTop: '16px' }}>
              <AeInput
                placeholder="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                type="password"
                autoComplete="current-password"
              />
            </div>
          )}

          {error && (
            <p style={{ color: 'rgba(255,100,100,0.7)', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>
              {error}
            </p>
          )}

          {/* Action buttons based on mode */}
          {mode === 'choose' && emailValid && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginTop: '20px', width: '100%' }}>
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={loading}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)',
                  fontSize: '13px', cursor: 'pointer', padding: '10px',
                  transition: 'color 200ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
              >
                {loading ? '...' : 'email me a link'}
              </button>
              <button
                type="button"
                onClick={() => setMode('password')}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)',
                  fontSize: '12px', cursor: 'pointer', padding: '8px',
                  transition: 'color 200ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
              >
                use password
              </button>
            </div>
          )}

          {mode === 'password' && (
            <div style={{ marginTop: '24px' }}>
              <AeArrow
                onClick={handlePasswordLogin}
                visible={emailValid && password.length >= 6 && !loading}
                disabled={loading}
              />
            </div>
          )}

          {mode === 'magic-link' && (
            <div style={{ marginTop: '20px' }}>
              <AeArrow
                onClick={handleMagicLink}
                visible={emailValid && !loading}
                disabled={loading}
              />
            </div>
          )}
        </form>

        {/* Passkey button */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handlePasskey}
            disabled={loading}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
              fontSize: '12px', cursor: 'pointer', padding: '10px',
              transition: 'color 200ms ease',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <circle cx="12" cy="16" r="1"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            enter with passkey
          </button>
        </div>

        {/* Footer links */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <AeQuietLink text="new here? claim your address" onClick={() => { window.location.href = '/signup' }} />
        </div>

        {mode === 'password' && (
          <div style={{ marginTop: '8px', textAlign: 'center' }}>
            <AeQuietLink text="back" onClick={() => setMode('choose')} />
          </div>
        )}
      </div>
    </div>
  )
}
