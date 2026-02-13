'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [nextSerial, setNextSerial] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [wallpaper, setWallpaper] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    fetch('/api/next-serial')
      .then(r => r.json())
      .then(d => setNextSerial(d.serial))
      .catch(() => setNextSerial(1002))

    // Pull wallpaper from the footprint they just came from
    const supabase = createBrowserSupabaseClient()
    async function getWallpaper() {
      // Try the slug they came from first
      if (slug) {
        const { data } = await supabase
          .from('footprints')
          .select('background_url')
          .eq('username', slug)
          .single()
        if (data?.background_url) { setWallpaper(data.background_url); return }
      }
      // Fallback to ae's wallpaper
      const { data } = await supabase
        .from('footprints')
        .select('background_url')
        .eq('serial_number', 1001)
        .single()
      if (data?.background_url) setWallpaper(data.background_url)
    }
    getWallpaper()
  }, [slug])

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
    <div className="min-h-screen relative overflow-hidden flex flex-col justify-end pb-16 px-7">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {/* Same wallpaper as the room they came from */}
      {wallpaper && (
        <>
          <img
            src={wallpaper}
            alt=""
            className="fixed inset-0 w-full h-full object-cover"
          />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.88) 100%)'
          }} />
        </>
      )}

      {/* Fallback if wallpaper hasn't loaded yet */}
      {!wallpaper && (
        <div className="fixed inset-0" style={{
          background: 'linear-gradient(165deg, #0d0d0f 0%, #080808 40%, #0a0a0c 70%, #0f0e12 100%)'
        }} />
      )}

      <Link
        href={slug ? `/${slug}` : '/'}
        className="fixed top-7 left-7 text-white/20 hover:text-white/50 transition-colors duration-300 z-10"
        style={{ fontFamily: f, fontSize: '14px', fontWeight: 400 }}
      >
        ←
      </Link>

      <div className={`relative z-10 w-full max-w-sm transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>

        {/* Serial + Price */}
        <div className="mb-8">
          {nextSerial && (
            <p className="text-white/50 mb-1" style={{ fontFamily: f, fontSize: '14px', fontWeight: 400 }}>
              #{String(nextSerial).padStart(4, '0')}
            </p>
          )}

          <h1 className="text-white/90 leading-none" style={{ fontFamily: f, fontSize: '52px', fontWeight: 400, letterSpacing: '-0.03em' }}>
            $10
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleCheckout} className="space-y-3 mb-8">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            required
            className="w-full backdrop-blur-md bg-white/[0.06] border border-white/[0.1] rounded-2xl px-5 py-4 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all duration-300"
            style={{ fontFamily: f, fontSize: '15px', fontWeight: 400 }}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-4 backdrop-blur-md bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] hover:border-white/[0.18] text-white/70 hover:text-white/90 transition-all duration-300 disabled:opacity-30"
            style={{ fontFamily: f, fontSize: '15px', fontWeight: 500 }}
          >
            {loading ? '...' : 'Get yours'}
          </button>
        </form>

        {/* Features */}
        <div className="space-y-1.5">
          {[
            'serial number · unlimited rooms',
            'paste any url — it becomes a tile',
            slug ? `footprint.onl/${slug}` : 'footprint.onl/you',
          ].map((text, i) => (
            <p
              key={i}
              style={{
                fontFamily: f,
                fontSize: '12px',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.15)',
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
  )
}
