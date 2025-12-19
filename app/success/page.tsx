'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

interface UserData {
  email: string
  serial_number: number
  slug: string
}

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch user data from session
  useEffect(() => {
    async function fetchSession() {
      if (!sessionId) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/session?id=${sessionId}`)
        const data = await res.json()
        
        if (data.user) {
          setUserData(data.user)
        }
      } catch (error) {
        console.error('Failed to fetch session:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSession()
  }, [sessionId])

  // Fallback data for demo
  const serial = userData?.serial_number || 8291 + Math.floor(Math.random() * 100)
  const slug = userData?.slug || `fp-${serial}-demo`
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://fp.link'}/${slug}`

  const copyLink = () => {
    navigator.clipboard.writeText(link)
    toast.success('Copied to clipboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-white/50">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      {/* Confetti effect would go here */}
      
      <div className="w-full max-w-md text-center">
        {/* Success icon */}
        <div className="w-20 h-20 rounded-full bg-green-400 flex items-center justify-center mx-auto mb-8 opacity-0 animate-pop-in">
          <span className="text-4xl text-ink">✓</span>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-light mb-4 opacity-0 animate-fade-up delay-200">
          You're in
        </h1>
        
        <p className="text-white/60 text-lg mb-12 opacity-0 animate-fade-up delay-300">
          Welcome to Footprint. Yours forever.
        </p>

        {/* Serial Card */}
        <div className="glass rounded-2xl p-8 mb-8 opacity-0 animate-fade-up delay-400">
          <p className="font-mono text-xs tracking-widest uppercase text-white/40 mb-3">
            Your serial number
          </p>
          <p className="font-mono text-5xl font-medium mb-4">
            #{serial.toLocaleString()}
          </p>
          <p className="text-sm text-white/40">
            This number can never be purchased again.
          </p>
        </div>

        {/* Link Box */}
        <div className="glass rounded-xl p-5 flex items-center gap-4 mb-6 opacity-0 animate-fade-up delay-500">
          <span className="font-mono text-sm text-white/60 flex-1 text-left truncate">
            {link}
          </span>
          <button
            onClick={copyLink}
            className="btn-primary py-2 px-4 text-xs rounded-lg flex-shrink-0"
          >
            Copy
          </button>
        </div>

        {/* QR Code placeholder */}
        <div className="mb-8 opacity-0 animate-fade-up delay-600">
          <div className="w-40 h-40 bg-paper rounded-xl mx-auto mb-3 flex items-center justify-center">
            <span className="font-mono text-xs text-ink/50">QR CODE</span>
          </div>
          <p className="font-mono text-xs text-white/30">
            Scan to view your footprint
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center opacity-0 animate-fade-up delay-700">
          <Link href={`/edit/${slug}`} className="btn-primary rounded-lg">
            Start building →
          </Link>
          <Link href={`/${slug}`} className="btn-primary bg-transparent border border-white/20 text-paper rounded-lg">
            View page
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-16 font-mono text-xs text-white/25 opacity-0 animate-fade-up delay-800">
          No refunds. Figure it out.
        </p>
      </div>
    </div>
  )
}
