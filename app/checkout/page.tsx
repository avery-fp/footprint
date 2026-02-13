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
    
    if (!email) {
      toast.error('Enter your email')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug }),
      })

      const data = await res.json()

      if (data.url) {
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
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* Ambient background */}
      <div className="fixed inset-0 bg-[#060608]" />
      <div 
        className="fixed inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(120,100,180,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(60,40,100,0.1) 0%, transparent 50%)',
        }}
      />

      {/* Back */}
      <Link
        href={slug ? `/${slug}` : '/'}
        className="fixed top-6 left-6 font-mono text-[10px] tracking-[0.2em] text-white/20 hover:text-white/50 transition-all duration-500 uppercase z-10"
      >
        ← back
      </Link>

      {/* Main */}
      <div className={`relative z-10 w-full max-w-md px-6 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        
        {/* æ mark */}
        <div className="text-center mb-16">
          <div className="inline-block mb-8 opacity-40">
            <span className="text-5xl" style={{ fontFamily: 'serif' }}>æ</span>
          </div>

          {/* Serial */}
          {nextSerial && (
            <div className="mb-8">
              <span className="font-mono text-[10px] tracking-[0.3em] text-white/20 uppercase block mb-2">
                Next available
              </span>
              <div className="font-mono text-4xl text-white/70 tracking-wider">
                #{String(nextSerial).padStart(4, '0')}
              </div>
            </div>
          )}

          {/* Price */}
          <div className="flex items-baseline justify-center gap-2 mb-3">
            <span className="font-mono text-6xl font-extralight text-white/90 tracking-tight">$10</span>
          </div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-white/20 uppercase">
            once · forever · yours
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleCheckout} className="space-y-4 mb-16">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your email"
            required
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl px-5 py-4 text-white/90 placeholder:text-white/15 font-mono text-sm tracking-wide focus:outline-none focus:border-white/15 transition-all duration-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-4 font-mono text-[11px] tracking-[0.2em] uppercase transition-all duration-500 disabled:opacity-30 text-white/70 hover:text-white border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04]"
          >
            {loading ? '...' : 'Claim your footprint'}
          </button>
        </form>

        {/* What you get */}
        <div className="space-y-4 mb-16">
          {[
            ['◈', 'Unique serial number — your permanent address'],
            ['∞', 'Unlimited rooms — arrange your entire world'],
            ['◎', 'Paste any URL — it becomes a tile'],
            ['#', `footprint.onl/${slug || 'you'}`],
          ].map(([icon, text], i) => (
            <div 
              key={i} 
              className="flex items-center gap-4 font-mono text-[11px] text-white/20 transition-all duration-700"
              style={{ 
                transitionDelay: `${i * 100 + 400}ms`,
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(8px)',
              }}
            >
              <span className="text-white/10 text-xs w-4 text-center flex-shrink-0">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* Fine print */}
        <p className="font-mono text-[9px] tracking-[0.2em] text-white/10 text-center uppercase">
          No subscriptions · No refunds · No bullshit
        </p>
      </div>
    </div>
  )
}
