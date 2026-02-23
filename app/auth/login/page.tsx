'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawRedirect = searchParams.get('redirect') || ''
  const customRedirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [promo, setPromo] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setNotFound(false)

    try {
      if (password) {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })

        if (res.ok) {
          const data = await res.json()
          const dest = customRedirect || (data.slug ? `/${data.slug}/home` : '/build')
          router.push(dest)
          return
        }

        const data = await res.json()
        toast.error(data.error || 'Invalid email or password')
        setLoading(false)
        return
      }

      // No password — send magic link (falls back to dev-login if email fails)
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect: customRedirect || undefined }),
      })

      const data = await res.json()
      if (data.success) {
        setSent(true)
      } else if (res.status === 404) {
        // No account — show create account option
        setNotFound(true)
      } else {
        // Magic link failed — log in directly via dev-login
        toast('signing you in directly...')
        window.location.href = `/api/auth/dev-login?email=${encodeURIComponent(email)}`
        return
      }
    } catch {
      toast.error('Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!promo) return
    setLoading(true)

    try {
      const res = await fetch('/api/checkout/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, promo }),
      })

      const data = await res.json()
      if (data.success) {
        // After promo signup, dev-login will handle redirect to editor
        window.location.href = `/api/auth/dev-login?email=${encodeURIComponent(email)}`
        return
      } else {
        toast.error(data.error || 'Invalid promo code')
      }
    } catch {
      toast.error('Failed')
    } finally {
      setLoading(false)
    }
  }

  // "Check your email" confirmation
  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <p
            className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3"
          >
            check your email
          </p>
          <p className="text-white/30 text-[13px] leading-relaxed">
            we sent a sign-in link to<br />
            <span className="text-white/50">{email}</span>
          </p>
          <button
            onClick={() => { setSent(false); setLoading(false) }}
            className="mt-8 text-white/15 text-[11px] hover:text-white/30 transition-colors"
          >
            try again
          </button>
        </div>
      </div>
    )
  }

  // "No account found" — create one with promo code
  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <p
            className="text-center text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3"
            style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
          >
            no account found
          </p>
          <p className="text-center text-white/30 text-[13px] leading-relaxed mb-8">
            <span className="text-white/50">{email}</span> doesn&apos;t have a footprint yet.
            <br />enter a promo code to create one.
          </p>

          <form onSubmit={handleCreateAccount} className="space-y-3">
            <input
              type="text"
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="promo code"
              className="w-full bg-white/[0.05] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/12 text-[14px]"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !promo}
              className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
            >
              {loading ? '...' : 'create account'}
            </button>
          </form>

          <button
            onClick={() => { setNotFound(false); setPromo('') }}
            className="mt-6 w-full text-center text-white/15 text-[11px] hover:text-white/30 transition-colors"
          >
            back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <p
          className="text-center text-[22px] font-light tracking-[-0.01em] text-white/90 mb-10"
          style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
        >
          footprint
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            aria-label="Email address"
            className="w-full bg-white/[0.05] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/12 text-[14px]"
            required
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            aria-label="Password"
            className="w-full bg-white/[0.05] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/12 text-[14px]"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
          >
            {loading ? '...' : password ? 'sign in' : 'continue'}
          </button>
        </form>

        <p className="mt-6 text-center text-white/15 text-[11px]">
          {password ? 'or leave blank for a magic link' : 'enter password, or continue for magic link'}
        </p>
      </div>
    </div>
  )
}
