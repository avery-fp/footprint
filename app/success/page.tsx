'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Status = 'activating' | 'success' | 'error'

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [status, setStatus] = useState<Status>('activating')
  const [serial, setSerial] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function activate() {
      if (!sessionId) {
        setError('Missing session ID')
        setStatus('error')
        return
      }

      try {
        const res = await fetch('/api/checkout/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Activation failed')
          setStatus('error')
          return
        }

        setSerial(data.serial)
        setStatus('success')

        // Auto-redirect to /build after brief flash
        setTimeout(() => {
          window.location.href = '/build'
        }, 2000)
      } catch {
        setError('Network error. Try refreshing.')
        setStatus('error')
      }
    }

    activate()
  }, [sessionId])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {status === 'activating' && (
        <>
          <div className="w-16 h-16 rounded-full border-2 border-white/20 border-t-white/60 animate-spin mb-8" />
          <p className="text-white/40 text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Activating your Footprint...
          </p>
        </>
      )}

      {status === 'success' && (
        <div className="text-center animate-fade-up">
          <div className="w-20 h-20 rounded-full bg-green-400 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl text-black">✓</span>
          </div>
          <h1
            className="text-4xl text-white mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: '-0.03em' }}
          >
            You're in
          </h1>
          {serial && (
            <p className="font-mono text-white/40 text-sm mb-6">
              FP #{serial.toLocaleString()}
            </p>
          )}
          <p className="text-white/25 text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Taking you to your room...
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl text-red-400">×</span>
          </div>
          <h1 className="text-2xl text-white mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Something went wrong
          </h1>
          <p className="text-white/40 text-sm mb-8" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition text-white/80 text-sm"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
