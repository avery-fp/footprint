'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SigninPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        const dest = data.slug ? `/${data.slug}/home` : '/build'
        router.push(dest)
      } else {
        setError(data.error || 'wrong email or password')
      }
    } catch {
      setError('network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs flex flex-col items-center">
        {/* Whisper heading */}
        <p className="font-mono text-white/15 text-[11px] tracking-[0.2em] uppercase mb-10">
          welcome back
        </p>

        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            aria-label="Email address"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white/80 placeholder:text-white/12 focus:outline-none focus:border-white/15 focus:bg-white/[0.06] text-[14px] transition-all duration-300"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            required
            autoFocus
            autoComplete="email"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            aria-label="Password"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white/80 placeholder:text-white/12 focus:outline-none focus:border-white/15 focus:bg-white/[0.06] text-[14px] transition-all duration-300"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-red-400/40 text-[11px] text-center font-mono">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full py-3.5 rounded-xl text-white/70 text-[14px] font-light tracking-wide hover:text-white/90 transition-all duration-300 disabled:opacity-20"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(20px) saturate(150%)',
              WebkitBackdropFilter: 'blur(20px) saturate(150%)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
            }}
          >
            {loading ? '...' : 'enter'}
          </button>
        </form>

        <p className="mt-10 text-center text-white/10 text-[11px] font-mono">
          new?{' '}
          <a href="/signup" className="text-white/20 hover:text-white/35 transition-colors duration-300">
            claim yours
          </a>
        </p>
      </div>
    </div>
  )
}
