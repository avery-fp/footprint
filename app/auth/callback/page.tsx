'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    
    // Supabase automatically handles the hash fragment from the magic link
    // We just need to wait for the session to be established
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.push(redirect)
      }
    })
  }, [router, redirect])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
    </div>
  )
}
