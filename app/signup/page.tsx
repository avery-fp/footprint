'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import AeInput from '@/components/auth/AeInput'
import AeArrow from '@/components/auth/AeArrow'
import URLPreview from '@/components/auth/URLPreview'
import AeQuietLink from '@/components/auth/AeQuietLink'

export default function SignupPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [error, setError] = useState('')

  // Username availability
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => usernameRef.current?.focus(), 100)
  }, [])

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

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const formValid = isUsernameValid && emailValid && password.length >= 6 && !loading

  const handleSubmit = async () => {
    if (!formValid) return
    setLoading(true)
    setError('')

    try {
      const supabase = createBrowserSupabaseClient()
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (authError) {
        setError(authError.message || 'something went wrong')
        doShake()
        return
      }

      if (!data.session) {
        setError('something went wrong')
        doShake()
        return
      }

      // Create user record + footprint via server
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
        }),
      })

      const result = await res.json()

      if (result.success) {
        const dest = result.slug ? `/${result.slug}/home` : '/build'
        window.location.href = dest
      } else {
        setError(result.error || 'something went wrong')
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
        {/* URL preview */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <URLPreview username={username} state={urlState} />
        </div>

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
            ref={usernameRef}
            placeholder="username"
            value={username}
            onChange={(e) => {
              const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
              if (v.length <= 20) {
                setUsername(v)
                setAvailable(null)
                setError('')
              }
            }}
            autoFocus
            autoComplete="off"
          />

          <div style={{ width: '100%', marginTop: '16px' }}>
            <AeInput
              placeholder="your email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              type="email"
              autoComplete="email"
            />
          </div>

          <div style={{ width: '100%', marginTop: '16px' }}>
            <AeInput
              placeholder="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              type="password"
              autoComplete="new-password"
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
              visible={formValid}
              disabled={loading}
            />
          </div>
        </form>

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <AeQuietLink text="already have a room? sign in" onClick={() => { window.location.href = '/login' }} />
        </div>
      </div>
    </div>
  )
}
