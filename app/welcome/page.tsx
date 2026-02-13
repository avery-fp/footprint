'use client'

import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function WelcomePage() {
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [serial, setSerial] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
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

    // Light enters slowly. Ando pacing.
    const t1 = setTimeout(() => setPhase(1), 600)
    const t2 = setTimeout(() => setPhase(2), 2400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || sending) return
    setSending(true)

    try {
      // Create the user + footprint
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      
      if (data.serial) {
        setSerial(String(data.serial).padStart(4, '0'))
        
        // Send magic link
        const supabase = createBrowserSupabaseClient()
        await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        })
        
        // Show the serial reveal
        setSent(true)
        setPhase(10) // trigger final phase
      } else {
        throw new Error(data.error || 'Failed')
      }
    } catch (err) {
      console.error(err)
      setSending(false)
    }
  }

  const f = "'DM Sans', -apple-system, sans-serif"

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {/* Same world */}
      {wallpaper ? (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.93) 100%)'
          }} />
        </>
      ) : (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      <div className="relative z-10 w-full px-7 flex flex-col items-center" style={{ fontFamily: f }}>

        {!sent ? (
          <>
            {/* Phase 1: The question. Nothing else. */}
            <div className="mb-12 transition-all duration-[1200ms] ease-out"
              style={{ 
                opacity: phase >= 1 ? 1 : 0,
                transform: phase >= 1 ? 'translateY(0)' : 'translateY(16px)',
              }}>
              <p className="text-white/80 text-center" style={{ 
                fontSize: 'clamp(28px, 6vw, 44px)', 
                fontWeight: 400, 
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
              }}>
                what&apos;s your email
              </p>
            </div>

            {/* Phase 2: The input */}
            <div className="w-full max-w-sm transition-all duration-[1000ms] ease-out"
              style={{ 
                opacity: phase >= 2 ? 1 : 0,
                transform: phase >= 2 ? 'translateY(0)' : 'translateY(10px)',
              }}>
              <form onSubmit={handleEnter} className="flex gap-2">
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
                  disabled={sending}
                  className="rounded-full px-7 py-3.5 bg-white text-black hover:bg-white/90 transition-all duration-200 disabled:opacity-30 text-[14px] font-medium shrink-0"
                >
                  {sending ? '...' : '→'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            {/* THE REVEAL: Their serial number, massive */}
            <div className="text-center animate-[fadeUp_1.5s_ease-out_forwards]">
              <p className="text-white/90 leading-none mb-4" style={{ 
                fontSize: 'clamp(72px, 18vw, 140px)', 
                fontWeight: 400, 
                letterSpacing: '-0.04em',
              }}>
                #{serial}
              </p>
              <p className="text-white/25 mb-2" style={{ fontSize: '15px', fontWeight: 400 }}>
                yours
              </p>
            </div>

            {/* After a beat, the instruction */}
            <div className="mt-16 animate-[fadeUp_1s_ease-out_1.5s_both]">
              <p className="text-white/20" style={{ fontSize: '14px', fontWeight: 400 }}>
                check your email to enter your room
              </p>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
