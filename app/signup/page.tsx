'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Phase = 'username' | 'details'

export default function SignupPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('username')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Username availability
  const [available, setAvailable] = useState<boolean | null>(null)
  const [availReason, setAvailReason] = useState('')
  const [checking, setChecking] = useState(false)

  const usernameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Auto-focus username on mount
  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  // Auto-focus email when phase advances
  useEffect(() => {
    if (phase === 'details') {
      setTimeout(() => emailRef.current?.focus(), 350)
    }
  }, [phase])

  // Debounced username check
  const checkUsername = useCallback(async (value: string) => {
    if (value.length < 2) {
      setAvailable(null)
      setAvailReason('')
      return
    }

    setChecking(true)
    try {
      const res = await fetch('/api/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: value }),
      })
      const data = await res.json()
      setAvailable(data.available)
      setAvailReason(data.reason || '')
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

  const advanceToDetails = () => {
    if (username.length < 2 || available === false || checking) return
    setPhase('details')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !email.trim() || !password.trim()) return
    if (available === false) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          email: email.trim(),
          password: password.trim(),
        }),
      })

      const data = await res.json()

      if (data.success) {
        router.push(`/${data.slug}/home`)
      } else {
        setError(data.error || 'something went wrong')
      }
    } catch {
      setError('network error')
    } finally {
      setLoading(false)
    }
  }

  const canAdvance = username.length >= 2 && available === true && !checking

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6">

      {/* Phase 1: Username — full screen, massive */}
      <div
        className="w-full flex flex-col items-center transition-all duration-500 ease-out"
        style={{
          opacity: phase === 'username' ? 1 : 0,
          transform: phase === 'username' ? 'translateY(0)' : 'translateY(-40px)',
          position: phase === 'username' ? 'relative' : 'absolute',
          pointerEvents: phase === 'username' ? 'auto' : 'none',
        }}
      >
        {/* URL preview — above the input */}
        <p className="font-mono text-white/15 text-[13px] tracking-[0.02em] mb-6"
           style={{ minHeight: '20px' }}
        >
          {username.length > 0
            ? <>footprint.onl/<span className="text-white/35">{username}</span></>
            : <span className="opacity-0">.</span>
          }
        </p>

        {/* The username input — big */}
        <input
          ref={usernameRef}
          type="text"
          value={username}
          onChange={(e) => {
            const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
            if (v.length <= 20) {
              setUsername(v)
              setAvailable(null)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              advanceToDetails()
            }
          }}
          placeholder="username"
          aria-label="Username"
          className="bg-transparent text-center text-white/90 placeholder:text-white/10 focus:outline-none"
          style={{
            fontSize: 'clamp(32px, 8vw, 48px)',
            fontWeight: 300,
            letterSpacing: '-0.02em',
            caretColor: 'rgba(255,255,255,0.4)',
            width: '100%',
            maxWidth: '480px',
          }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {/* Status line below input */}
        <div className="mt-4" style={{ minHeight: '20px' }}>
          {username.length >= 2 && (
            checking ? (
              <p className="text-white/15 text-[11px] font-mono">...</p>
            ) : available === true ? (
              <p className="text-white/25 text-[11px] font-mono">yours</p>
            ) : available === false ? (
              <p className="text-red-400/50 text-[11px] font-mono">{availReason || 'taken'}</p>
            ) : null
          )}
        </div>

        {/* Enter hint — appears when available */}
        <div
          className="mt-10 transition-all duration-300"
          style={{ opacity: canAdvance ? 1 : 0, transform: canAdvance ? 'translateY(0)' : 'translateY(4px)' }}
        >
          <button
            onClick={advanceToDetails}
            className="text-white/20 text-[12px] font-mono hover:text-white/40 transition-colors"
            tabIndex={canAdvance ? 0 : -1}
          >
            enter
          </button>
        </div>
      </div>

      {/* Phase 2: Email + Password — slides in from below */}
      <div
        className="w-full max-w-xs transition-all duration-500 ease-out"
        style={{
          opacity: phase === 'details' ? 1 : 0,
          transform: phase === 'details' ? 'translateY(0)' : 'translateY(30px)',
          position: phase === 'details' ? 'relative' : 'absolute',
          pointerEvents: phase === 'details' ? 'auto' : 'none',
        }}
      >
        {/* Username locked — small, above form */}
        <div className="text-center mb-10">
          <p className="font-mono text-white/20 text-[12px] tracking-[0.02em] mb-1">
            footprint.onl/{username}
          </p>
          <button
            onClick={() => setPhase('username')}
            className="text-white/10 text-[10px] font-mono hover:text-white/25 transition-colors"
          >
            change
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            aria-label="Email address"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/15 focus:outline-none focus:border-white/20 text-[14px] transition-colors"
            required
            autoComplete="email"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            aria-label="Password"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/15 focus:outline-none focus:border-white/20 text-[14px] transition-colors"
            required
            minLength={6}
            autoComplete="new-password"
          />

          {error && (
            <p className="text-red-400/60 text-[11px] text-center font-mono">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || available === false || !username.trim() || !email.trim() || !password.trim()}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-30"
          >
            {loading ? '...' : 'claim'}
          </button>
        </form>

        <p className="mt-8 text-center text-white/10 text-[11px] font-mono">
          already?{' '}
          <a href="/signin" className="text-white/20 hover:text-white/40 transition-colors">
            sign in
          </a>
        </p>
      </div>
    </div>
  )
}
