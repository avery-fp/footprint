'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AeInput from '@/components/auth/AeInput'
import AeArrow from '@/components/auth/AeArrow'
import URLPreview from '@/components/auth/URLPreview'

/**
 * /welcome — Username claim page for OAuth/Magic Link users.
 *
 * After signing in via Google/Apple/Magic Link, new users land here
 * to pick their username before getting their room.
 */
export default function WelcomePage() {
  const [username, setUsername] = useState('')
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

  // Debounced username availability check
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

  const isUsernameValid = username.length >= 3 && /^[a-z0-9-]+$/.test(username) &&
    !username.startsWith('-') && !username.endsWith('-') && !username.includes('--')

  const canSubmit = isUsernameValid && available === true && !loading

  const doShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const handleClaim = async () => {
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
        window.location.href = `/${data.username}/home`
      } else {
        setError(data.error || 'something went wrong')
        doShake()
      }
    } catch {
      setError('something went wrong')
      doShake()
    } finally {
      setLoading(false)
    }
  }

  const urlState: 'available' | 'taken' | 'checking' =
    checking ? 'checking' : available === false ? 'taken' : 'available'

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: '#050505' }}
    >
      <div style={{ width: '100%', maxWidth: '320px' }} className={shake ? 'animate-shake' : ''}>
        {/* Welcome text */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', letterSpacing: '0.04em' }}>
            welcome to footprint
          </p>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '15px', marginTop: '8px' }}>
            claim your room
          </p>
        </div>

        {/* URL preview */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <URLPreview username={username} state={urlState} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); handleClaim() }}
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
              onClick={handleClaim}
              visible={canSubmit}
              disabled={loading}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
