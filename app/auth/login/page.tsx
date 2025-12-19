'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

/**
 * Login Page
 * 
 * Passwordless auth via magic links.
 * User enters email → we send link → they click → they're in.
 * 
 * Simple. No passwords to forget. No friction.
 */
export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'
  
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      toast.error('Enter your email')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect }),
      })

      const data = await res.json()

      if (data.success) {
        setSent(true)
        toast.success('Check your email!')
      } else {
        toast.error(data.error || 'Something went wrong')
      }
    } catch (error) {
      toast.error('Failed to send link')
    } finally {
      setLoading(false)
    }
  }

  // Success state - email sent
  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-green-400/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">✉️</span>
          </div>
          
          <h1 className="text-2xl font-light mb-4">Check your email</h1>
          
          <p className="text-white/60 mb-8">
            We sent a magic link to <span className="text-paper">{email}</span>.
            Click it to sign in.
          </p>
          
          <button
            onClick={() => setSent(false)}
            className="font-mono text-sm text-white/40 hover:text-paper transition-colors"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      {/* Back link */}
      <Link 
        href="/"
        className="fixed top-6 left-6 font-mono text-xs text-white/40 hover:text-white/60 transition-colors"
      >
        ← back
      </Link>

      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-light mb-4">Sign in</h1>
          <p className="text-white/50">
            We'll send you a magic link. No password needed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-mono text-xs tracking-widest uppercase text-white/40 block mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-field"
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        <p className="mt-8 text-center text-white/40 text-sm">
          Don't have an account?{' '}
          <Link href="/checkout" className="text-paper hover:underline">
            Get your Footprint
          </Link>
        </p>
      </div>
    </div>
  )
}
