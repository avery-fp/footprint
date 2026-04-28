'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function GiftClaimContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [success, setSuccess] = useState<{ serial_number: number; username: string } | null>(null)

  const usernameRef = useRef<HTMLInputElement>(null)
  const checkTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setTimeout(() => usernameRef.current?.focus(), 100)
  }, [])

  useEffect(() => {
    if (checkTimeout.current) clearTimeout(checkTimeout.current)
    if (!username || username.length < 3) {
      setAvailable(null)
      return
    }

    setChecking(true)
    checkTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/check-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        })
        const data = await res.json()
        setAvailable(data.available)
      } catch {
        setAvailable(null)
      } finally {
        setChecking(false)
      }
    }, 500)
  }, [username])

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#050505' }}>
        <p className="text-white/40 text-sm">Invalid gift link.</p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#050505' }}>
        <div className="w-full max-w-xs text-center">
          <p className="font-mono text-white/25 text-[11px] tracking-[0.2em] uppercase mb-6">
            FP #{success.serial_number.toLocaleString()}
          </p>
          <p className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-2">
            welcome
          </p>
          <p className="text-white/40 text-[13px] font-mono tracking-wide mb-10">
            footprint.onl/{success.username}
          </p>
          <button
            onClick={() => { window.location.href = `/${success.username}/home` }}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all"
          >
            start building
          </button>
        </div>
      </div>
    )
  }

  const usernameValid = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(username) && username.length >= 3
  const formValid = usernameValid && available === true

  const handleClaim = async () => {
    if (!formValid || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/gifts/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, username }),
      })

      const data = await res.json()

      if (data.success) {
        setSuccess({ serial_number: data.serial_number, username: data.username })
      } else {
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#050505' }}>
      <div className="w-full max-w-xs">
        <div className="text-center mb-10">
          <p className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-2">
            claim your footprint
          </p>
          <p className="text-white/30 text-[13px] leading-relaxed">
            someone gifted you a page for everything you do.
          </p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleClaim() }} className="space-y-4">
          <div>
            <input
              ref={usernameRef}
              type="text"
              placeholder="pick a username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                setError('')
              }}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 text-[14px]"
              autoComplete="off"
              maxLength={20}
            />
            {username.length >= 3 && (
              <p className="text-[11px] mt-1.5 px-1 font-mono">
                {checking ? (
                  <span className="text-white/20">checking...</span>
                ) : available === true ? (
                  <span className="text-green-400/60">footprint.onl/{username} is yours</span>
                ) : available === false ? (
                  <span className="text-red-400/60">taken</span>
                ) : null}
              </p>
            )}
          </div>

          {error && (
            <p className="text-red-400/70 text-[13px] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!formValid || loading}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? '...' : 'claim'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function GiftClaimPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#050505' }} />}>
      <GiftClaimContent />
    </Suspense>
  )
}
