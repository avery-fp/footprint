'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase'

/**
 * Login Page — æ aesthetic
 * 
 * Same dimension as landing, checkout, welcome.
 * Wallpaper bleeds through. Typography matches.
 * The form is barely there — just the landscape and one question.
 */
export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'
  
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    async function load() {
      const { data } = await supabase
        .from('footprints')
        .select('background_url')
        .eq('serial_number', 1001)
        .single()
      if (data?.background_url) setWallpaper(data.background_url)
    }
    load()

    const t1 = setTimeout(() => setPhase(1), 400)
    const t2 = setTimeout(() => setPhase(2), 1200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)

    try {
      const supabase = createBrowserSupabaseClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        },
      })

      if (otpError) {
        toast.error(otpError.message || 'something went wrong')
      } else {
        setSent(true)
        setPhase(10)
      }
    } catch (error) {
      toast.error('could not send link')
    } finally {
      setLoading(false)
    }
  }

  const f = "'DM Sans', -apple-system, sans-serif"

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col justify-end pb-[18vh]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {wallpaper ? (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.95) 100%)'
          }} />
        </>
      ) : (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      <div className="relative z-10 w-full px-7 flex flex-col items-center" style={{ fontFamily: f }}>

        {!sent ? (
          <>
            <div className="mb-8 transition-all duration-[1000ms] ease-out"
              style={{
                opacity: phase >= 1 ? 1 : 0,
                transform: phase >= 1 ? 'translateY(0)' : 'translateY(14px)',
              }}>
              <p className="text-white/60 text-center" style={{
                fontSize: 'clamp(22px, 4.5vw, 32px)',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}>
                enter your room
              </p>
            </div>

            <div className="w-full max-w-sm transition-all duration-[800ms] ease-out"
              style={{
                opacity: phase >= 2 ? 1 : 0,
                transform: phase >= 2 ? 'translateY(0)' : 'translateY(8px)',
              }}>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email"
                  required
                  autoFocus
                  className="flex-1 backdrop-blur-md bg-white/[0.08] border border-white/[0.1] rounded-full px-5 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all duration-300 text-[15px] text-center"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full px-7 py-3.5 bg-white text-black hover:bg-white/90 transition-all duration-200 disabled:opacity-30 text-[14px] font-medium shrink-0"
                >
                  {loading ? '...' : '\u2192'}
                </button>
              </form>

              <div className="mt-8 flex items-center justify-center gap-6">
                <Link
                  href="/"
                  className="text-white/15 hover:text-white/30 transition-colors duration-300"
                  style={{ fontSize: '12px', fontWeight: 400 }}
                >
                  home
                </Link>
                <span className="text-white/10" style={{ fontSize: '12px' }}>·</span>
                <Link
                  href="https://buy.stripe.com/9B6cN40Ef0sG2z98b214400"
                  className="text-white/15 hover:text-white/30 transition-colors duration-300"
                  style={{ fontSize: '12px', fontWeight: 400 }}
                >
                  get yours
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-center animate-[fadeUp_1.2s_ease-out_forwards]">
              <p className="text-white/80 mb-3" style={{
                fontSize: 'clamp(28px, 6vw, 44px)',
                fontWeight: 400,
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
              }}>
                check your email
              </p>
              <p className="text-white/25" style={{ fontSize: '14px', fontWeight: 400 }}>
                we sent a link to {email}
              </p>
            </div>

            <div className="mt-12 animate-[fadeUp_0.8s_ease-out_1s_both]">
              <button
                onClick={() => { setSent(false); setPhase(2) }}
                className="text-white/15 hover:text-white/30 transition-colors duration-300"
                style={{ fontSize: '12px', fontWeight: 400 }}
              >
                use a different email
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
