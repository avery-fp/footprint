'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { startAuthentication } from '@simplewebauthn/browser'

export default function LoginPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [shake, setShake] = useState(false)
  const [mounted, setMounted] = useState(false)

  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || ''

  useEffect(() => {
    // Staggered entrance
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  const doShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  // ── OAuth ──
  const handleOAuth = async (provider: 'apple' | 'google') => {
    setLoading(provider)
    setError('')
    try {
      const supabase = createBrowserSupabaseClient()
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      if (redirectTo) callbackUrl.searchParams.set('redirect', redirectTo)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
          ...(provider === 'apple' && { scopes: 'name email' }),
        },
      })
      if (error) {
        setError('could not connect')
        doShake()
        setLoading(null)
      }
      // Browser will redirect — no need to clear loading
    } catch {
      setError('something went wrong')
      doShake()
      setLoading(null)
    }
  }

  // ── Passkey ──
  const handlePasskey = async () => {
    setLoading('passkey')
    setError('')
    try {
      // 1. Get challenge from server
      const optionsRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options' }),
      })
      if (!optionsRes.ok) {
        const data = await optionsRes.json()
        throw new Error(data.error || 'no passkey found')
      }
      const options = await optionsRes.json()

      // 2. Browser credential ceremony
      const credential = await startAuthentication({ optionsJSON: options })

      // 3. Verify with server
      const verifyRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', credential }),
      })
      const result = await verifyRes.json()

      if (result.success) {
        window.location.href = redirectTo || '/dashboard'
      } else {
        setError(result.error || 'passkey failed')
        doShake()
      }
    } catch (err: any) {
      // User cancelled or no credential available
      if (err?.name === 'NotAllowedError') {
        setError('')
      } else {
        setError('passkey not recognized')
        doShake()
      }
    } finally {
      setLoading(null)
    }
  }

  // ── Magic link ──
  const handleMagicLink = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('enter a valid email')
      doShake()
      return
    }
    setLoading('email')
    setError('')
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), redirect: redirectTo }),
      })
      const data = await res.json()
      if (data.success) {
        setEmailSent(true)
      } else {
        setError(data.error || 'could not send link')
        doShake()
      }
    } catch {
      setError('something went wrong')
      doShake()
    } finally {
      setLoading(null)
    }
  }

  // ── Email sent confirmation ──
  if (emailSent) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6"
        style={{ background: '#050505' }}>
        <div style={{ width: '100%', maxWidth: '340px', textAlign: 'center' }}
          className="materialize">
          <div style={{
            fontSize: '32px',
            marginBottom: '24px',
            opacity: 0.6,
          }}>
            ✓
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '15px',
            lineHeight: '1.6',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            check your email
          </p>
          <p style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: '13px',
            marginTop: '8px',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {email}
          </p>
          <button
            onClick={() => { setEmailSent(false); setEmail(''); setShowEmail(false) }}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.2)',
              fontSize: '13px',
              cursor: 'pointer',
              marginTop: '32px',
              padding: '12px',
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            try another way
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: '#050505' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '340px',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 600ms ease, transform 600ms ease',
        }}
        className={shake ? 'animate-shake' : ''}
      >
        {/* ── Mark ── */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.2)',
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 400,
          }}>
            footprint
          </p>
        </div>

        {/* ── Heading ── */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 300,
            color: 'rgba(255,255,255,0.85)',
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: '-0.01em',
            margin: 0,
          }}>
            Enter
          </h1>
        </div>

        {/* ── Primary actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Continue with Apple */}
          <AuthButton
            onClick={() => handleOAuth('apple')}
            loading={loading === 'apple'}
            disabled={!!loading}
            icon={<AppleIcon />}
            label="Continue with Apple"
          />

          {/* Continue with Google */}
          <AuthButton
            onClick={() => handleOAuth('google')}
            loading={loading === 'google'}
            disabled={!!loading}
            icon={<GoogleIcon />}
            label="Continue with Google"
          />

          {/* Use Passkey */}
          <AuthButton
            onClick={handlePasskey}
            loading={loading === 'passkey'}
            disabled={!!loading}
            icon={<PasskeyIcon />}
            label="Use Passkey"
            variant="secondary"
          />
        </div>

        {/* ── Error ── */}
        {error && (
          <p style={{
            color: 'rgba(255,100,100,0.7)',
            fontSize: '13px',
            marginTop: '16px',
            textAlign: 'center',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {error}
          </p>
        )}

        {/* ── Email fallback ── */}
        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          {!showEmail ? (
            <button
              onClick={() => setShowEmail(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.2)',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: "'Space Grotesk', sans-serif",
                transition: 'color 200ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
            >
              email instead
            </button>
          ) : (
            <div style={{
              opacity: 1,
              animation: 'fadeIn 300ms ease',
            }}>
              <form onSubmit={(e) => { e.preventDefault(); handleMagicLink() }}
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  placeholder="your email"
                  autoFocus
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: '15px',
                    padding: '10px 0',
                    outline: 'none',
                    fontFamily: "'Space Grotesk', sans-serif",
                    caretColor: 'rgba(255,255,255,0.4)',
                    textAlign: 'center',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.35)' }}
                  onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
                />
                <button
                  type="submit"
                  disabled={loading === 'email'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: email ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                    fontSize: '18px',
                    cursor: email ? 'pointer' : 'default',
                    padding: '8px',
                    minWidth: '44px',
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 200ms ease',
                  }}
                >
                  {loading === 'email' ? '...' : '→'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Auth Button Component ──

function AuthButton({ onClick, loading, disabled, icon, label, variant = 'primary' }: {
  onClick: () => void
  loading: boolean
  disabled: boolean
  icon: React.ReactNode
  label: string
  variant?: 'primary' | 'secondary'
}) {
  const isPrimary = variant === 'primary'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="touch-manipulation"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        width: '100%',
        padding: '16px 20px',
        fontSize: '15px',
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 400,
        color: isPrimary ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
        background: isPrimary ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: isPrimary ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 200ms ease',
        opacity: disabled && !loading ? 0.5 : 1,
        minHeight: '52px',
        letterSpacing: '0.01em',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = isPrimary
            ? 'rgba(255,255,255,0.1)'
            : 'rgba(255,255,255,0.04)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isPrimary
          ? 'rgba(255,255,255,0.06)'
          : 'transparent'
        e.currentTarget.style.borderColor = isPrimary
          ? 'rgba(255,255,255,0.1)'
          : 'rgba(255,255,255,0.06)'
      }}
    >
      {loading ? (
        <span style={{ opacity: 0.5 }}>...</span>
      ) : (
        <>
          <span style={{ display: 'flex', alignItems: 'center', width: '20px', height: '20px' }}>
            {icon}
          </span>
          <span>{label}</span>
        </>
      )}
    </button>
  )
}

// ── Icons ──

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function PasskeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/>
      <path d="M5 19.5C5.5 18 7 15 12 15s6.5 3 7 4.5"/>
      <circle cx="12" cy="10" r="3"/>
      <path d="M19 8v6"/>
      <path d="M22 11h-6"/>
    </svg>
  )
}
