'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabaseClient } from '@/lib/supabase'

/**
 * Magic Link Verification — æ aesthetic
 * 
 * User clicks magic link → lands here → we verify → they're in.
 * Same wallpaper dimension. Minimal. The landscape does the waiting.
 */
export default function VerifyPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const token = searchParams.get('token')
  const redirect = searchParams.get('redirect') || '/dashboard'
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')
  const [wallpaper, setWallpaper] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    async function loadWallpaper() {
      const { data } = await supabase
        .from('footprints')
        .select('background_url')
        .eq('serial_number', 1001)
        .single()
      if (data?.background_url) setWallpaper(data.background_url)
    }
    loadWallpaper()
  }, [])

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('no token provided')
      return
    }

    async function verify() {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await res.json()

        if (data.success) {
          setStatus('success')
          setTimeout(() => {
            router.push(redirect)
          }, 1200)
        } else {
          setStatus('error')
          setError(data.error || 'link expired')
        }
      } catch (err) {
        setStatus('error')
        setError('verification failed')
      }
    }

    verify()
  }, [token, redirect, router])

  const f = "'DM Sans', -apple-system, sans-serif"

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {wallpaper ? (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.93) 100%)'
          }} />
        </>
      ) : (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      <div className="relative z-10 w-full px-7 flex flex-col items-center" style={{ fontFamily: f }}>

        {status === 'verifying' && (
          <div className="text-center animate-[fadeUp_1s_ease-out_forwards]">
            <div className="w-2 h-2 rounded-full bg-white/40 mx-auto mb-8 animate-pulse" />
            <p className="text-white/50" style={{
              fontSize: 'clamp(24px, 5vw, 36px)',
              fontWeight: 400,
              letterSpacing: '-0.025em',
            }}>
              opening your room
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center animate-[fadeUp_0.8s_ease-out_forwards]">
            <p className="text-white/80" style={{
              fontSize: 'clamp(28px, 6vw, 44px)',
              fontWeight: 400,
              letterSpacing: '-0.03em',
            }}>
              you're in
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="animate-[fadeUp_0.8s_ease-out_forwards]">
              <p className="text-white/60 mb-2" style={{
                fontSize: 'clamp(24px, 5vw, 36px)',
                fontWeight: 400,
                letterSpacing: '-0.025em',
              }}>
                {error}
              </p>
            </div>
            <div className="mt-10 animate-[fadeUp_0.6s_ease-out_0.5s_both]">
              <Link 
                href="/auth/login"
                className="rounded-full px-7 py-3.5 bg-white text-black hover:bg-white/90 transition-all duration-200 text-[14px] font-medium inline-block"
              >
                try again
              </Link>
            </div>
          </div>
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
