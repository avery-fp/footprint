'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetch('/api/next-serial')
      .then(r => r.json())
      .then(d => setNextSerial(d.serial))
      .catch(() => setNextSerial(1002))
  }, [])

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { toast.error('Enter your email'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url }
      else { throw new Error(data.error || 'Something went wrong') }
    } catch (error) {
      toast.error('Failed to start checkout')
      setLoading(false)
    }
  }

  const f = "'DM Sans', -apple-system, sans-serif"

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {/* Depth — not flat black, alive */}
      <div className="fixed inset-0" style={{
        background: 'linear-gradient(165deg, #0d0d0f 0%, #080808 40%, #0a0a0c 70%, #0f0e12 100%)'
      }} />
      {/* Subtle warm glow behind the content */}
      <div className="fixed inset-0" style={{
        background: 'radial-gradient(ellipse at 30% 50%, rgba(80,60,100,0.06) 0%, transparent 60%)'
      }} />

      <Link
        href={slug ? `/${slug}` : '/'}
        className="fixed top-7 left-7 text-white/12 hover:text-white/35 transition-colors duration-300 z-10"
        style={{ fontFamily: f, fontSize: '14px', fontWeight: 400 }}
      >
        ←
      </Link>

      <div className={`relative z-10 w-full px-8 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>

        <div className="max-w-sm mx-auto">
          {/* Serial + Price — tight stack */}
          <div className="mb-10">
            {nextSerial && (
              <p className="text-white/50 mb-1" style={{ fontFamily: f, fontSize: '14px', fontWeight: 400 }}>
                #{String(nextSerial).padStart(4, '0')}
              </p>
            )}

            <h1 className="text-white/90 leading-none" style={{ fontFamily: f, fontSize: '52px', fontWeight: 400, letterSpacing: '-0.03em' }}>
              $10
            </h1>
          </div>

          {/* Form — tight to the price, one unit */}
          <form onSubmit={handleCheckout} className="space-y-3 mb-8">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              required
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-2xl px-5 py-4 text-white/90 placeholder:text-white/15 focus:outline-none focus:border-white/15 transition-all duration-300"
              style={{ fontFamily: f, fontSize: '15px', fontWeight: 400 }}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl py-4 bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.07] hover:border-white/[0.12] text-white/60 hover:text-white/90 transition-all duration-300 disabled:opacity-30"
              style={{ fontFamily: f, fontSize: '15px', fontWeight: 500 }}
            >
              {loading ? '...' : 'Get yours'}
            </button>
          </form>

          {/* What you get — left aligned, quiet */}
          <div className="space-y-1.5">
            {[
              'serial number · unlimited rooms',
              'paste any url — it becomes a tile',
              slug ? `footprint.onl/${slug}` : 'footprint.onl/you',
            ].map((text, i) => (
              <p
                key={i}
                className="text-white/10"
                style={{
                  fontFamily: f,
                  fontSize: '12px',
                  fontWeight: 400,
                  transition: 'all 0.6s ease',
                  transitionDelay: `${i * 100 + 400}ms`,
                  opacity: mounted ? 1 : 0,
                }}
              >
                {text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
