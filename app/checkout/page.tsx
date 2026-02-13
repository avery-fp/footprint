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

  const font = "'DM Sans', sans-serif"

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      <div className="fixed inset-0 bg-[#080808]" />
      <div className="fixed inset-0 opacity-20" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(100,80,150,0.15) 0%, transparent 60%)',
      }} />

      <Link
        href={slug ? `/${slug}` : '/'}
        className="fixed top-7 left-7 md:top-10 md:left-14 text-white/15 hover:text-white/40 transition-colors duration-300 z-10"
        style={{ fontFamily: font, fontSize: '13px' }}
      >
        ← back
      </Link>

      <div className={`relative z-10 w-full max-w-sm px-6 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>

        <div className="text-center mb-14">
          {nextSerial && (
            <div className="mb-6">
              <div className="text-white/60 mb-1" style={{ fontFamily: font, fontSize: '13px', fontWeight: 400 }}>
                Footprint
              </div>
              <div className="text-white/80" style={{ fontFamily: font, fontSize: '40px', fontWeight: 400, letterSpacing: '-0.03em' }}>
                #{String(nextSerial).padStart(4, '0')}
              </div>
            </div>
          )}

          <div className="text-white/90 mb-2" style={{ fontFamily: font, fontSize: '48px', fontWeight: 400, letterSpacing: '-0.03em' }}>
            $10
          </div>
          <p className="text-white/20" style={{ fontFamily: font, fontSize: '13px', fontWeight: 400 }}>
            once. forever. yours.
          </p>
        </div>

        <form onSubmit={handleCheckout} className="space-y-3 mb-14">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            required
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all duration-300"
            style={{ fontFamily: font, fontSize: '14px' }}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3.5 bg-white text-black/90 hover:bg-white/90 transition-all duration-200 disabled:opacity-30"
            style={{ fontFamily: font, fontSize: '14px', fontWeight: 500 }}
          >
            {loading ? '...' : 'Claim your footprint'}
          </button>
        </form>

        <div className="space-y-3 mb-14">
          {[
            'unique serial number',
            'unlimited rooms',
            'paste any url — it becomes a tile',
            slug ? `footprint.onl/${slug}` : 'footprint.onl/you',
          ].map((text, i) => (
            <div
              key={i}
              className="text-white/15"
              style={{
                fontFamily: font,
                fontSize: '12px',
                fontWeight: 400,
                transition: 'all 0.5s ease',
                transitionDelay: `${i * 80 + 300}ms`,
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(6px)',
              }}
            >
              {text}
            </div>
          ))}
        </div>

        <p className="text-white/8 text-center" style={{ fontFamily: font, fontSize: '11px' }}>
          no subscriptions. no refunds. no bullshit.
        </p>
      </div>
    </div>
  )
}
