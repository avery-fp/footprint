'use client'

import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function WelcomePage() {
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState(0)
  const [linkSent, setLinkSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

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
    const t2 = setTimeout(() => setPhase(2), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || sending) return
    setSending(true)
    setError('')

    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const supabase = createBrowserSupabaseClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/dashboard`,
        },
      })
      
      if (otpError) {
        setError('failed to send link. try again.')
        setSending(false)
        return
      }

      setLinkSent(true)
    } catch (err) {
      setError('something went wrong. try again.')
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center"
      style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {/* wallpaper */}
      {wallpaper ? (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0.92) 100%)'
          }} />
        </>
      ) : (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center">

        {!linkSent ? (
          <>
            <div className="transition-all duration-[900ms] ease-out mb-10"
              style={{ 
                opacity: phase >= 1 ? 1 : 0,
                transform: phase >= 1 ? 'translateY(0)' : 'translateY(14px)',
              }}>
              <p className="text-white/85 text-center" style={{
                fontSize: 'clamp(24px, 5vw, 32px)',
                fontWeight: 300,
                letterSpacing: '-0.02em',
              }}>
                sign in to your footprint
              </p>
            </div>

            <div className="w-full transition-all duration-[900ms] ease-out"
              style={{ 
                opacity: phase >= 2 ? 1 : 0,
                transform: phase >= 2 ? 'translateY(0)' : 'translateY(8px)',
              }}>
              <form onSubmit={handleEnter} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email"
                  required
                  autoFocus
                  className="w-full backdrop-blur-md bg-white/[0.08] border border-white/[0.1] rounded-full px-5 py-3.5 text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-all duration-300 text-[14px] text-center"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full py-3.5 rounded-full bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all duration-200 disabled:opacity-30"
                >
                  {sending ? '...' : 'send sign in link'}
                </button>
              </form>
              {error && (
                <p className="mt-3 text-red-400/80 text-xs text-center">{error}</p>
              )}
            </div>
          </>
        ) : (
          <div className="text-center animate-[fadeIn_0.8s_ease-out_forwards]">
            <p className="text-white/85 text-2xl font-light mb-3">check your email</p>
            <p className="text-white/30 text-sm">click the link to enter your room</p>
          </div>
        )}

      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
