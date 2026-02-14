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

    const t1 = setTimeout(() => setPhase(1), 500)
    const t2 = setTimeout(() => setPhase(2), 2800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
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

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center"
      style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
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

      <div className="relative z-10 w-full px-7 flex flex-col items-center">

        {/* THE NUMBER. NOTHING ELSE. */}
        <div className="transition-all duration-[1600ms] ease-out"
          style={{ 
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          }}>
          <p className="text-white/90 leading-none text-center" style={{ 
            fontSize: 'clamp(90px, 22vw, 180px)', 
            fontWeight: 300, 
            letterSpacing: '-0.05em',
          }}>
            {serial ? `#${serial}` : ''}
          </p>
        </div>

        {/* EMAIL — no words. just the field. */}
        {!linkSent ? (
          <div className="mt-16 w-full max-w-[280px] transition-all duration-[1200ms] ease-out"
            style={{ 
              opacity: phase >= 2 ? 1 : 0,
              transform: phase >= 2 ? 'translateY(0)' : 'translateY(6px)',
            }}>
            <form onSubmit={handleEnter} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="flex-1 bg-white/[0.05] border border-white/[0.06] rounded-full px-4 py-2.5 text-white/80 placeholder:text-white/10 focus:outline-none focus:border-white/12 transition-all duration-300 text-[13px] text-center"
              />
              <button
                type="submit"
                disabled={sending}
                className="w-10 h-10 rounded-full bg-white/80 text-black text-[14px] font-medium shrink-0 hover:bg-white transition-all duration-200 disabled:opacity-20 flex items-center justify-center"
              >
                {sending ? '' : '\u2192'}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-16 animate-[fadeIn_1s_ease-out_forwards]">
            <p className="text-white/15 text-[13px]">check email</p>
          </div>
        )}

      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
