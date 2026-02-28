'use client'

import { useState, useEffect, useRef } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
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
      const supabase = createBrowserSupabaseClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError || !data.session) {
        setError('invalid email or password')
        doShake()
        return
      }

      // Create fp_session cookie via server
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${data.session.access_token}`,
        },
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

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: '#050505' }}
    >
      <div
        style={{ width: '100%', maxWidth: '320px' }}
        className={shake ? 'animate-shake' : ''}
      >
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
