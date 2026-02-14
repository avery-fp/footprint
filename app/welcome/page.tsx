'use client'

import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function WelcomePage() {
  const [wallpaper, setWallpaper] = useState<string | null>(null)
  const [serial, setSerial] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState(0)
  const [linkSent, setLinkSent] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    async function load() {
      const { data } = await supabase
        .from('footprints')
        .select('background_url')
        .eq('serial_number', 1001)
        .single()
      if (data?.background_url) setWallpaper(data.background_url)
      
      const { data: latest } = await supabase
        .from('users')
        .select('serial_number')
        .order('serial_number', { ascending: false })
        .limit(1)
        .single()
      if (latest) setSerial(String(latest.serial_number).padStart(4, '0'))
    }
    load()

    const t1 = setTimeout(() => setPhase(1), 600)
    const t2 = setTimeout(() => setPhase(2), 2200)
    const t3 = setTimeout(() => setPhase(3), 3400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || sending) return
    setSending(true)

    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.serial) setSerial(String(data.serial).padStart(4, '0'))

      const supabase = createBrowserSupabaseClient()
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/dashboard`,
        },
      })
      
      setLinkSent(true)
    } catch (err) {
      console.error(err)
      setSending(false)
    }
  }

  const f = "'DM Sans', -apple-system, sans-serif"

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

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

        {/* THE NUMBER */}
        <div className="text-center transition-all duration-[1400ms] ease-out"
          style={{ 
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? 'translateY(0)' : 'translateY(20px)',
          }}>
          <p className="text-white/90 leading-none" style={{ 
            fontSize: 'clamp(80px, 20vw, 160px)', 
            fontWeight: 400, 
            letterSpacing: '-0.04em',
          }}>
            {serial ? `#${serial}` : ''}
          </p>
        </div>

        {/* "yours" */}
        <div className="mt-3 transition-all duration-[1000ms] ease-out"
          style={{ opacity: phase >= 2 ? 1 : 0 }}>
          <p className="text-white/25" style={{ fontSize: '16px', fontWeight: 400 }}>
            yours
          </p>
        </div>

        {/* Email — small, quiet, just the door */}
        {!linkSent ? (
          <div className="mt-20 w-full max-w-xs transition-all duration-[1000ms] ease-out"
            style={{ 
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? 'translateY(0)' : 'translateY(8px)',
            }}>
            <form onSubmit={handleEnter} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="enter your email"
                required
                autoFocus
                className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-full px-4 py-3 text-white/80 placeholder:text-white/15 focus:outline-none focus:border-white/15 transition-all duration-300 text-[13px] text-center"
              />
              <button
                type="submit"
                disabled={sending}
                className="rounded-full px-5 py-3 bg-white/90 text-black text-[13px] font-medium shrink-0 hover:bg-white transition-all duration-200 disabled:opacity-30"
              >
                {sending ? '...' : '\u2192'}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-20 animate-[fadeUp_0.8s_ease-out_forwards]">
            <p className="text-white/20" style={{ fontSize: '14px', fontWeight: 400 }}>
              check your email
            </p>
          </div>
        )}

      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
