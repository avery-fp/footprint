'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { FOOTPRINT_PRICE_DISPLAY } from '@/lib/constants'
import { humanError, humanUsernameReason } from '@/lib/errors'

type Step = 'username' | 'processing' | 'done'

export default function PublishPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const presetUsername = searchParams.get('username')

  const [step, setStep] = useState<Step>(sessionId ? 'processing' : 'username')
  const [username, setUsername] = useState(presetUsername || '')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [availReason, setAvailReason] = useState('')
  const [checking, setChecking] = useState(false)
  const [promo, setPromo] = useState('')
  const [loading, setLoading] = useState(false)
  const [serial, setSerial] = useState<number | null>(null)
  const [finalSlug, setFinalSlug] = useState('')

  // Finalize after Stripe payment redirect (with timeout + dedup guard)
  const finalizeCalledRef = useRef(false)
  useEffect(() => {
    if (!sessionId || !presetUsername) return
    if (finalizeCalledRef.current) return
    finalizeCalledRef.current = true

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    async function finalize() {
      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'finalize',
            session_id: sessionId,
            username: presetUsername,
          }),
          signal: controller.signal,
        })

        const data = await res.json()
        if (data.success) {
          setSerial(data.serial)
          setFinalSlug(data.slug)
          setStep('done')
        } else {
          toast.error(humanError(data.error))
          setStep('username')
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          toast.error('Request timed out. Try again.')
        } else {
          toast.error('Connection lost. Check your internet and try again.')
        }
        setStep('username')
      } finally {
        clearTimeout(timeout)
      }
    }

    finalize()
  }, [sessionId, presetUsername])

  // Debounced username check
  const checkUsername = useCallback(async (value: string) => {
    if (value.length < 2) {
      setAvailable(null)
      setAvailReason('')
      return
    }

    setChecking(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-username', username: value }),
      })
      const data = await res.json()
      setAvailable(data.available)
      setAvailReason(data.reason || '')
    } catch {
      setAvailable(null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username.trim()) checkUsername(username.trim())
    }, 400)
    return () => clearTimeout(timer)
  }, [username, checkUsername])

  const handlePublishFree = async () => {
    if (!username.trim() || !promo.trim() || !available) return
    setLoading(true)

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish-free',
          username: username.trim(),
          promo: promo.trim(),
        }),
      })

      const data = await res.json()
      if (data.success) {
        setSerial(data.serial)
        setFinalSlug(data.slug)
        setStep('done')
      } else {
        toast.error(humanError(data.error))
      }
    } catch {
      toast.error('Connection lost. Check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handlePublishPaid = async () => {
    if (!username.trim() || !available) return
    setLoading(true)

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish-paid',
          username: username.trim(),
        }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(humanError(data.error))
        setLoading(false)
      }
    } catch {
      toast.error('Connection lost. Check your internet and try again.')
      setLoading(false)
    }
  }

  const handlePublish = () => {
    if (promo.trim()) {
      handlePublishFree()
    } else {
      handlePublishPaid()
    }
  }

  // Processing state (waiting for Stripe finalization)
  if (step === 'processing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg-void)' }}>
        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
        <p className="mt-4 text-white/30 text-[13px]">publishing...</p>
      </div>
    )
  }

  // Done — published!
  if (step === 'done') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg-void)' }}>
        <div className="w-full max-w-xs text-center">
          {serial && (
            <p className="font-mono text-white/25 text-[11px] tracking-[0.2em] uppercase mb-6">
              FP #{serial.toLocaleString()}
            </p>
          )}

          <p className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3">
            you're live
          </p>

          <p className="font-mono text-white/40 text-[13px] mb-8">
            footprint.onl/{finalSlug}/fp
          </p>

          <button
            onClick={() => router.push(`/${finalSlug}/home`)}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all mb-3"
          >
            open your room
          </button>

          <button
            onClick={() => {
              const url = `https://footprint.onl/${finalSlug}/fp`
              navigator.clipboard.writeText(url)
              toast.success('copied')
            }}
            className="w-full py-3 text-white/30 text-[12px] hover:text-white/50 transition-colors"
          >
            copy link
          </button>
        </div>
      </div>
    )
  }

  // Username + promo step
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg-void)' }}>
      <div className="w-full max-w-xs">
        <p className="text-center text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3">
          publish
        </p>
        <p className="text-center text-white/30 text-[13px] leading-relaxed mb-10">
          choose your Footprint URL. this is permanent.
        </p>

        <div className="space-y-4">
          {/* Username */}
          <div>
            <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <span className="text-white/20 text-[13px] pl-4 shrink-0">footprint.onl/</span>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
                  setAvailable(null)
                }}
                placeholder="username"
                aria-label="Username"
                className="flex-1 bg-transparent py-3.5 pr-4 text-white/90 placeholder:text-white/20 focus:outline-none text-[14px]"
                autoFocus
              />
            </div>
            {username.length >= 2 && (
              <div className="mt-1.5 px-1">
                {checking ? (
                  <p className="text-white/20 text-[11px]">checking...</p>
                ) : available === true ? (
                  <p className="text-green-400/70 text-[11px]">available</p>
                ) : available === false ? (
                  <p className="text-red-400/70 text-[11px]">{availReason ? humanUsernameReason(availReason) : 'That name is already claimed.'}</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Promo code */}
          <input
            type="text"
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="promo code (optional)"
            aria-label="Promo code"
            className="w-full rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none text-[14px]"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          />

          {/* Publish button */}
          <button
            onClick={handlePublish}
            disabled={loading || !available || !username.trim()}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
          >
            {loading ? '...' : promo.trim() ? 'publish' : `publish — ${FOOTPRINT_PRICE_DISPLAY}`}
          </button>
        </div>

        <p className="mt-6 text-center text-white/15 text-[11px]">
          one-time. no subscription. yours forever.
        </p>
      </div>
    </div>
  )
}
