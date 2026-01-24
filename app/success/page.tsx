'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { loadDraft, clearDraft } from '@/lib/draft-store'

type Status = 'loading' | 'publishing' | 'success' | 'error'

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const slug = searchParams.get('slug')

  const [status, setStatus] = useState<Status>('loading')
  const [serialNumber, setSerialNumber] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function publishDraft() {
      if (!sessionId || !slug) {
        setErrorMessage('Missing session or page information')
        setStatus('error')
        return
      }

      // Load draft from localStorage
      const draft = loadDraft(slug)
      if (!draft) {
        setErrorMessage('No draft found. You may have already published.')
        setStatus('error')
        return
      }

      setStatus('publishing')

      try {
        const res = await fetch('/api/import-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            slug,
            draft,
          }),
        })

        const data = await res.json()

        if (res.ok && data.success) {
          setSerialNumber(data.serial_number)
          clearDraft(slug)
          setStatus('success')
          toast.success('Your page is live!')
        } else {
          setErrorMessage(data.error || 'Failed to publish')
          setStatus('error')
        }
      } catch (error) {
        console.error('Failed to publish:', error)
        setErrorMessage('Network error. Please try again.')
        setStatus('error')
      }
    }

    publishDraft()
  }, [sessionId, slug])

  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/${slug}`

  const copyLink = () => {
    navigator.clipboard.writeText(link)
    toast.success('Copied to clipboard')
  }

  if (status === 'loading' || status === 'publishing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full border-2 border-white/20 border-t-white/60 animate-spin mb-8" />
        <p className="font-mono text-white/50">
          {status === 'loading' ? 'Loading...' : 'Publishing your page...'}
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-8">
          <span className="text-4xl text-red-400">×</span>
        </div>
        <h1 className="text-3xl font-light mb-4">Something went wrong</h1>
        <p className="text-white/50 mb-8">{errorMessage}</p>
        <div className="flex gap-3">
          {slug && (
            <Link
              href={`/edit/${slug}`}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition"
            >
              Back to editor
            </Link>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        {/* Success icon */}
        <div className="w-20 h-20 rounded-full bg-green-400 flex items-center justify-center mx-auto mb-8 opacity-0 animate-pop-in">
          <span className="text-4xl text-black">✓</span>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-light mb-4 opacity-0 animate-fade-up delay-200">
          You're live
        </h1>

        <p className="text-white/60 text-lg mb-12 opacity-0 animate-fade-up delay-300">
          Your page is now public. Share it with the world.
        </p>

        {/* FP Number Card */}
        {serialNumber && (
          <div className="glass rounded-2xl p-8 mb-8 opacity-0 animate-fade-up delay-400">
            <p className="font-mono text-xs tracking-widest uppercase text-white/40 mb-3">
              Your Footprint Number
            </p>
            <p className="font-mono text-5xl font-medium mb-4">
              FP #{serialNumber.toLocaleString()}
            </p>
            <p className="text-sm text-white/40">
              This number is yours forever.
            </p>
          </div>
        )}

        {/* Link Box */}
        <div className="glass rounded-xl p-5 flex items-center gap-4 mb-8 opacity-0 animate-fade-up delay-500">
          <span className="font-mono text-sm text-white/60 flex-1 text-left truncate">
            {link}
          </span>
          <button
            onClick={copyLink}
            className="bg-white/10 hover:bg-white/20 py-2 px-4 text-xs rounded-lg flex-shrink-0 transition"
          >
            Copy
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center opacity-0 animate-fade-up delay-600">
          <Link
            href={`/${slug}`}
            className="px-6 py-3 bg-green-500 hover:bg-green-400 text-white rounded-lg transition"
          >
            View your page
          </Link>
          <Link
            href={`/edit/${slug}`}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition"
          >
            Keep editing
          </Link>
        </div>
      </div>
    </div>
  )
}
