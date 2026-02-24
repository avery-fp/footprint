'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Username availability
  const [available, setAvailable] = useState<boolean | null>(null)
  const [availReason, setAvailReason] = useState('')
  const [checking, setChecking] = useState(false)

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
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        {/* Æ logo */}
        <p className="text-center text-white/80 text-[32px] font-light tracking-[0.12em] mb-12">
          æ
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
                if (v.length <= 20) {
                  setUsername(v)
                  setAvailable(null)
                }
              }}
              placeholder="username"
              aria-label="Username"
              className="w-full bg-white/[0.05] border border-white/[0.12] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/25 text-[14px] transition-colors"
              required
              autoFocus
              autoComplete="username"
            />
            {/* Live URL preview */}
            {username.length > 0 && (
              <p className="mt-2 px-1 text-white/20 text-[11px] font-mono">
                footprint.onl/<span className="text-white/40">{username}</span>
              </p>
            )}
            {/* Availability status */}
            {username.length >= 2 && (
              <div className="mt-1 px-1">
                {checking ? (
                  <p className="text-white/20 text-[11px]">checking...</p>
                ) : available === true ? (
                  <p className="text-green-400/70 text-[11px]">available</p>
                ) : available === false ? (
                  <p className="text-red-400/70 text-[11px]">{availReason || 'not available'}</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Email */}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            aria-label="Email address"
            className="w-full bg-white/[0.05] border border-white/[0.12] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/25 text-[14px] transition-colors"
            required
            autoComplete="email"
          />

          {/* Password */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            aria-label="Password"
            className="w-full bg-white/[0.05] border border-white/[0.12] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/25 text-[14px] transition-colors"
            required
            minLength={6}
            autoComplete="new-password"
          />

          {error && (
            <p className="text-red-400/80 text-[12px] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || available === false || !username.trim() || !email.trim() || !password.trim()}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
          >
            {loading ? '...' : 'make yours'}
          </button>
        </form>

        <p className="mt-8 text-center text-white/15 text-[11px]">
          already have one?{' '}
          <a href="/signin" className="text-white/30 hover:text-white/50 transition-colors">
            sign in
          </a>
        </p>
      </div>
    </div>
  )
}
