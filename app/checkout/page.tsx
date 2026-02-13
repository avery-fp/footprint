'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const supabase = createBrowserSupabaseClient()
    async function load() {
      if (slug) {
        const { data } = await supabase
          .from('footprints')
          .select('background_url')
          .eq('username', slug)
          .single()
        if (data?.background_url) { setWallpaper(data.background_url); return }
      }
      const { data } = await supabase
        .from('footprints')
        .select('background_url')
        .eq('serial_number', 1001)
        .single()
      if (data?.background_url) setWallpaper(data.background_url)
    }
    load()
  }, [slug])

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    try {
      // Try server-side first
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      // If server fails, throw to trigger fallback
      throw new Error(data.error || 'Server checkout failed')
    } catch (err: any) {
      console.warn('Server checkout failed, trying client-side:', err?.message)
      
      // Fallback: use Stripe Price ID if available
      const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
      if (priceId) {
        try {
          const stripe = await stripePromise
          if (stripe) {
            const { error } = await stripe.redirectToCheckout({
              lineItems: [{ price: priceId, quantity: 1 }],
              mode: 'payment',
              successUrl: `${window.location.origin}/success?slug=${slug || ''}`,
              cancelUrl: window.location.href,
              customerEmail: email,
            })
            if (error) throw error
            return
          }
        } catch (clientErr: any) {
          console.error('Client checkout also failed:', clientErr)
        }
      }
      
      // Final fallback: direct Stripe payment link
      // Check if STRIPE_PRICE_ID env var has a payment link
      toast.error(err?.message || 'Payment connection failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-end">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {wallpaper ? (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.92) 100%)'
          }} />
        </>
      ) : (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      <div className={`relative z-10 w-full px-7 pb-14 transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}
        style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

        <div className="max-w-sm">
          <p className="text-white/90 leading-none mb-2" style={{ fontSize: '44px', fontWeight: 400, letterSpacing: '-0.03em' }}>
            $10
          </p>
          <p className="text-white/30 mb-8" style={{ fontSize: '14px', fontWeight: 400 }}>
            one page. all your things. it&apos;s yours.
          </p>

          <form onSubmit={handleCheckout} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              required
              className="flex-1 backdrop-blur-md bg-white/[0.08] border border-white/[0.1] rounded-full px-5 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all duration-300 text-[15px]"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-full px-7 py-3.5 bg-white text-black hover:bg-white/90 transition-all duration-200 disabled:opacity-30 text-[14px] font-medium shrink-0"
            >
              {loading ? '...' : 'Go'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
