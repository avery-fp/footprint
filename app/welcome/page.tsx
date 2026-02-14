'use client'

import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function WelcomePage() {
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState(0)
  const [linkSent, setLinkSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300)
    const t2 = setTimeout(() => setPhase(2), 1200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || sending) return
    setSending(true)
    setError('')

    try {
      // Create user + footprint
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      
      if (!res.ok && !data.serial) {
        // User might already exist, that's fine — still send magic link
      }

      // Send magic link via Supabase OTP
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
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-[#0a0a0a]"
      style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center">

        {!linkSent ? (
          <>
            {/* sign in */}
            <div className="transition-all duration-[800ms] ease-out mb-10"
              style={{ 
                opacity: phase >= 1 ? 1 : 0,
                transform: phase >= 1 ? 'translateY(0)' : 'translateY(12px)',
              }}>
              <p className="text-white/80 text-center text-2xl font-light tracking-tight">
                sign in to your footprint
              </p>
            </div>

            {/* email + submit */}
            <div className="w-full transition-all duration-[800ms] ease-out"
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
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-all duration-300 text-[14px] text-center"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all duration-200 disabled:opacity-30"
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
          <div className="text-center animate-[fadeIn_0.6s_ease-out_forwards]">
            <p className="text-white/80 text-xl font-light mb-3">check your email</p>
            <p className="text-white/25 text-sm">click the link to enter your room</p>
          </div>
        )}

      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
