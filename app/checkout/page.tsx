'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const [refCode, setRefCode] = useState(searchParams.get('ref') || '')

  // Pick up referral from URL param or previous sessionStorage (from public page visit)
  useEffect(() => {
    const urlRef = searchParams.get('ref')
    if (urlRef) {
      sessionStorage.setItem('fp_ref', urlRef)
      setRefCode(urlRef)
    } else {
      const stored = sessionStorage.getItem('fp_ref')
      if (stored) setRefCode(stored)
    }
  }, [searchParams])

  const [email, setEmail] = useState('')
  const [promo, setPromo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    try {
      const normalizedPromo = promo.trim().toLowerCase()

      // Free path: promo code "please"
      if (normalizedPromo === 'please') {
        const res = await fetch('/api/checkout/free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, promo: normalizedPromo, ref: refCode }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Something went wrong')
          setLoading(false)
          return
        }
        window.location.href = '/build'
        return
      }

      // Paid path: Stripe checkout
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, promo: normalizedPromo, ref: refCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to start checkout')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Network error. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>
      <div className="fixed inset-0 bg-[#080808]" />

      <div className="relative z-10 w-full max-w-sm px-6">
        <h1
          className="text-white mb-2 text-center"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '42px',
            fontWeight: 400,
            letterSpacing: '-0.035em',
          }}
        >
          footprint
        </h1>
        <p
          className="text-white/30 text-center mb-10"
          style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}
        >
          a room for your internet. $10.
        </p>

        <form onSubmit={handleCheckout} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your email"
            required
            autoFocus
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 text-sm transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          />

          <input
            type="text"
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="promo code (optional)"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white/70 placeholder:text-white/15 focus:outline-none focus:border-white/15 text-sm transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          />

          {error && (
            <p className="text-red-400/80 text-xs text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-xl px-4 py-3.5 bg-white text-black/90 hover:bg-white/90 transition-all disabled:opacity-30 text-sm font-medium"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {loading ? '...' : promo.trim().toLowerCase() === 'please' ? 'Claim yours — free' : 'Claim yours — $10'}
          </button>
        </form>

        <p
          className="text-white/15 text-xs text-center mt-8"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          one payment. yours forever.
        </p>
      </div>
    </div>
  )
}
