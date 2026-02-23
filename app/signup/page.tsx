'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await res.json()

      if (data.success) {
        if (data.existing && data.slug) {
          // Existing user — go to their editor
          router.push(`/${data.slug}/home`)
        } else {
          // New user — go to build
          router.push('/build')
        }
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
        <p
          className="text-center text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3"
        >
          make yours
        </p>
        <p className="text-center text-white/30 text-[13px] leading-relaxed mb-10">
          enter your email to start building.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            className="w-full bg-white/[0.05] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/12 text-[14px]"
            required
            autoFocus
          />
          {error && (
            <p className="text-red-400/80 text-[12px] text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
          >
            {loading ? '...' : 'continue'}
          </button>
        </form>

        <p className="mt-8 text-center text-white/15 text-[11px]">
          already have one?{' '}
          <a href="/auth/login" className="text-white/30 hover:text-white/50 transition-colors">
            sign in
          </a>
        </p>
      </div>
    </div>
  )
}
