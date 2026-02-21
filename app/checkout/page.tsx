'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const DM = "'DM Sans', sans-serif"

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const refParam = searchParams.get('ref')

  const [email, setEmail] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    try {
      const trimmedPromo = promoCode.trim().toLowerCase()

      // Promo "please" → free path
      if (trimmedPromo === 'please') {
        const res = await fetch('/api/checkout/free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), promo: trimmedPromo, ref: refParam }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Something went wrong')
          setLoading(false)
          return
        }
        // Free path: user created, cookie set → go to edit page
        if (data.slug) {
          window.location.href = `/${data.slug}/home`
        } else {
          window.location.href = '/build'
        }
        return
      }

      // Standard $10 Stripe checkout
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ref: refParam }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create checkout')
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
    <div className="min-h-[100dvh] relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      <div className="fixed inset-0 bg-[#080808]" />

      <div className="relative z-10 w-full max-w-sm px-6 pb-[env(safe-area-inset-bottom)]">
        <div className="text-center mb-16">
          <Link
            href="/"
            className="text-white/15 hover:text-white/30 text-xs transition-colors"
            style={{ fontFamily: DM }}
          >
            footprint
          </Link>
        </div>

        <div className="text-center mb-10">
          <h1
            className="text-white/90 mb-2"
            style={{ fontFamily: DM, fontSize: '32px', fontWeight: 400, letterSpacing: '-0.03em' }}
          >
            get your page
          </h1>
          <p className="text-white/30" style={{ fontFamily: DM, fontSize: '14px' }}>
            everything in one place
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your email"
            required
            autoFocus
            className="w-full px-4 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
            style={{ fontFamily: DM, fontSize: '16px', minHeight: '48px', lineHeight: '48px', padding: '0 16px' }}
          />

          <div className="relative">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="promo code"
              className="w-full px-4 bg-white/[0.03] border border-white/[0.05] rounded-xl text-white/70 placeholder:text-white/15 focus:outline-none focus:border-white/15 transition-colors"
              style={{ fontFamily: DM, fontSize: '16px', minHeight: '48px', lineHeight: '48px', padding: '0 16px' }}
            />
            {promoCode.trim().toLowerCase() === 'please' && (
              <div
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                style={{ fontFamily: DM, fontSize: '11px' }}
              >
                welcome in
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-400/80 text-xs text-center" style={{ fontFamily: DM }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full rounded-xl bg-white text-black/90 hover:bg-white/90 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: DM, fontSize: '16px', fontWeight: 500, minHeight: '48px' }}
          >
            {loading
              ? '...'
              : promoCode.trim().toLowerCase() === 'please'
                ? 'enter'
                : 'continue · $10'
            }
          </button>
        </form>

        <p
          className="text-center mt-6 text-white/15"
          style={{ fontFamily: DM, fontSize: '11px', letterSpacing: '0.02em' }}
        >
          yours forever
        </p>
      </div>
    </div>
  )
}
