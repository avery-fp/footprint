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
        setError(data.error || 'Invalid email or password')
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
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            aria-label="Email address"
            className="w-full bg-white/[0.05] border border-white/[0.12] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/25 text-[14px] transition-colors"
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
            className="w-full bg-white/[0.05] border border-white/[0.12] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/25 text-[14px] transition-colors"
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="text-red-400/80 text-[12px] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
          >
            {loading ? '...' : 'enter'}
          </button>
        </form>

        <p className="mt-8 text-center text-white/15 text-[11px]">
          don&apos;t have one?{' '}
          <a href="/signup" className="text-white/30 hover:text-white/50 transition-colors">
            make yours
          </a>
        </p>
      </div>
    </div>
  )
}
