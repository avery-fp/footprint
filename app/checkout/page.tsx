'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')
  const [wallpaper, setWallpaper] = useState<string | null>(null)

  useEffect(() => {
    // If payment link is configured, redirect immediately
    const paymentLink = process.env.NEXT_PUBLIC_PAYMENT_LINK
    if (paymentLink) {
      window.location.href = paymentLink
      return
    }

    // Load wallpaper for visual while they wait
    const supabase = createBrowserSupabaseClient()
    async function load() {
      if (slug) {
        const { data } = await supabase
          .from('footprints')
          .select('background_url')
          .eq('username', slug)
          .single()
        if (data?.background_url) { setWallpaper(data.background_url); return }
      }
      const { data } = await supabase
        .from('footprints')
        .select('background_url')
        .eq('serial_number', 1001)
        .single()
      if (data?.background_url) setWallpaper(data.background_url)
    }
    load()
  }, [slug])

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {wallpaper ? (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.92) 100%)'
          }} />
        </>
      ) : (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      <p className="relative z-10 text-white/30" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px' }}>
        Redirecting to payment...
      </p>
    </div>
  )
}
