'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get('redirect') || '/dashboard'
  const errorMsg = searchParams.get('error')
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)

    try {
      // Try password login first if password is provided
      if (password) {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        
        if (res.ok) {
          router.push(redirect)
          return
        }
        // If password fails, show error
        const data = await res.json()
        toast.error(data.error || 'Invalid email or password')
        setLoading(false)
        return
      }

      // No password — send magic link
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Check your email for a sign-in link')
      } else {
        toast.error(data.error || 'Something went wrong')
      }
    } catch {
      toast.error('Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      <Link 
        href="/"
        className="fixed top-6 left-6 font-mono text-xs text-white/40 hover:text-white/60 transition-colors"
      >
        ← back
      </Link>

      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          {errorMsg && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{decodeURIComponent(errorMsg)}</p>
            </div>
          )}
          <h1 className="text-3xl font-light mb-4">sign in</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/15 text-sm"
            required
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/15 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90 transition-all disabled:opacity-50"
          >
            {loading ? '...' : password ? 'sign in' : 'send magic link'}
          </button>
        </form>

        <p className="mt-6 text-center text-white/20 text-xs">
          {password ? 'leave password blank for magic link' : 'enter password if you have one'}
        </p>
      </div>
    </div>
  )
}
