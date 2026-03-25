'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase'

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug')
  const [wallpaper, setWallpaper] = useState<string | null>(null)

  useEffect(() => {
    // Create a proper checkout session via the API
    async function startCheckout() {
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: slug || undefined }),
        })
        const data = await res.json()
        if (data.url) {
          window.location.href = data.url
        }
      } catch {
        // Fallback: load wallpaper while they wait
      }
    }
    startCheckout()

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

      <p className="relative z-10 text-white/30 text-[15px]">
        Redirecting to payment...
      </p>
    </div>
  )
}
