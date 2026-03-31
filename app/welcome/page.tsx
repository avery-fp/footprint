'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * /welcome — Username selection for new OAuth/passkey users.
 *
 * After authenticating via Apple/Google/passkey, new users land here
 * to pick a username before entering their footprint.
 */
export default function WelcomePage() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [mounted, setMounted] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const suggestedName = searchParams.get('name') || ''

  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true)
      inputRef.current?.focus()
    }, 50)
    return () => clearTimeout(t)
  }, [])

  // Auto-suggest from OAuth display name
  useEffect(() => {
    if (suggestedName && !username) {
      const slug = suggestedName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20)
      if (slug.length >= 3) {
        setUsername(slug)
      }
    }
  }, [suggestedName, username])

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
    }, 400)
    return () => clearTimeout(timer)
  }, [username, checkUsername])

  const isValid = username.length >= 3 && username.length <= 20
    && /^[a-z0-9-]+$/.test(username)
    && !username.startsWith('-') && !username.endsWith('-')
    && !username.includes('--')

  const canSubmit = isValid && available === true && !loading

  const doShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/claim-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })

      const data = await res.json()

      if (data.success) {
        window.location.href = data.slug ? `/${data.slug}/home` : '/build'
      } else {
        setError(data.error || 'could not claim that name')
        doShake()
      }
    } catch {
      setError('something went wrong')
      doShake()
    } finally {
      setLoading(false)
    }
  }

  // URL preview state
  const urlColor = checking
    ? 'rgba(255,255,255,0.2)'
    : available === false
    ? 'rgba(255,100,100,0.5)'
    : available === true
    ? 'rgba(100,255,150,0.5)'
    : 'rgba(255,255,255,0.15)'

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
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 300,
            color: 'rgba(255,255,255,0.85)',
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: '-0.01em',
            margin: 0,
          }}>
            Claim your name
          </h1>
        </div>

        {/* URL preview */}
        <div style={{
          textAlign: 'center',
          marginBottom: '24px',
          fontSize: '13px',
          fontFamily: "'JetBrains Mono', monospace",
          color: urlColor,
          transition: 'color 200ms ease',
          minHeight: '20px',
        }}>
          {username.length >= 1 && (
            <span>footprint.onl/{username}</span>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            value={username}
            onChange={(e) => {
              const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
              if (v.length <= 20) {
                setUsername(v)
                setAvailable(null)
                setError('')
              }
            }}
            placeholder="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent text-center focus:outline-none"
            style={{
              fontSize: '18px',
              color: 'rgba(255,255,255,0.9)',
              caretColor: 'rgba(255,255,255,0.4)',
              borderBottom: '1px solid rgba(255,255,255,0.15)',
              paddingBottom: '12px',
              fontFamily: "'Space Grotesk', sans-serif",
              transition: 'border-color 200ms ease',
            }}
            onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.35)' }}
            onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.15)' }}
          />

          {error && (
            <p style={{
              color: 'rgba(255,100,100,0.7)',
              fontSize: '13px',
              marginTop: '12px',
              textAlign: 'center',
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="touch-manipulation"
            style={{
              marginTop: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '16px 20px',
              fontSize: '15px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 400,
              color: canSubmit ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
              background: canSubmit ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: '1px solid',
              borderColor: canSubmit ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
              borderRadius: '12px',
              cursor: canSubmit ? 'pointer' : 'default',
              transition: 'all 200ms ease',
              minHeight: '52px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {loading ? '...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
