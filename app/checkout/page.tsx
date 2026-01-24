'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      toast.error('Enter your email')
      return
    }

    setLoading(true)

    try {
      // Call our API to create Stripe checkout session
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug }),
      })

      const data = await res.json()

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Something went wrong')
      }
    } catch (error) {
      toast.error('Failed to start checkout')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      {/* Back link */}
      <Link
        href={slug ? `/edit/${slug}` : '/'}
        className="fixed top-6 left-6 font-mono text-xs text-white/40 hover:text-white/60 transition-colors"
      >
        ← back
      </Link>

      <div className="w-full max-w-sm">
        {/* Price badge */}
        <div className="text-center mb-12">
          <div className="inline-block glass rounded-full px-6 py-3 mb-8">
            <span className="font-mono text-2xl font-medium">$10</span>
            <span className="font-mono text-sm text-white/50 ml-2">once, forever</span>
          </div>
          
          <h1 className="text-3xl font-light mb-4">
            {slug ? 'Publish your Footprint' : 'Get your Footprint'}
          </h1>
          <p className="text-white/50">
            {slug ? (
              <>Your page will be live at <span className="text-white/70">footprint.onl/{slug}</span></>
            ) : (
              'One page. Infinite rooms. Yours forever.'
            )}
          </p>
        </div>

        {/* Checkout form */}
        <form onSubmit={handleCheckout} className="space-y-4">
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
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Continue to payment'}
          </button>
        </form>

        {/* What you get */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="font-mono text-xs tracking-widest uppercase text-white/35 mb-6">
            What you get
          </p>
          <ul className="space-y-3 text-sm text-white/60">
            <li className="flex items-center gap-3">
              <span className="text-white/40">◈</span>
              <span>Unique serial number</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-white/40">∞</span>
              <span>Unlimited footprints (rooms)</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-white/40">◎</span>
              <span>Paste any URL, instant embed</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-white/40">#</span>
              <span>Your own link: fp.link/you</span>
            </li>
          </ul>
        </div>

        {/* Fine print */}
        <p className="mt-12 font-mono text-xs text-white/25 text-center">
          No refunds. No subscriptions. No bullshit.
        </p>
      </div>
    </div>
  )
}
