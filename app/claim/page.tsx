'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { humanError, humanUsernameReason } from '@/lib/errors'
import { getTheme } from '@/lib/themes'
import ClaimCeremony from '@/components/ClaimCeremony'

type Step = 'username' | 'processing' | 'ceremony' | 'done'

// Ghost tile grid — mirrors the preview template proportions
const GHOST_TILES = [
  { span: 2, aspect: 'aspect-video' },
  { span: 1, aspect: 'aspect-square' },
  { span: 1, aspect: 'aspect-square' },
  { span: 1, aspect: 'aspect-square' },
  { span: 1, aspect: 'aspect-square' },
  { span: 2, aspect: 'aspect-video' },
]

export default function ClaimPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const presetUsername = searchParams.get('username')
  const previewName = searchParams.get('name')

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
          setStep('ceremony')
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
        setStep('ceremony')
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

  // Midnight theme — the product's atmosphere
  const theme = getTheme('midnight')

  // Shared background shell for all claim states
  const ClaimShell = ({ children }: { children: React.ReactNode }) => (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      {/* Warm radial depth — same as public pages */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.02) 0%, transparent 70%)',
        }}
      />

      {/* Ghost building — if they arrived from preview with ?name= */}
      {previewName && (
        <div className="fixed inset-0 z-0 pointer-events-none flex flex-col items-center animate-ghost-breath animate-ghost-drift">
          <div style={{ height: '80px' }} />
          <h2
            className={`${
              previewName.length <= 6
                ? 'text-4xl md:text-6xl tracking-[0.22em] font-normal'
                : previewName.length <= 12
                ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
            }`}
            style={{ color: theme.colors.text }}
          >
            {previewName}
          </h2>
          <div className="flex items-center justify-center mt-4 mb-6">
            <div className="flex items-center gap-0 font-mono">
              {['work', 'links', 'about'].map((space, i) => (
                <span key={space} className="flex items-center whitespace-nowrap">
                  {i > 0 && <span className="mx-2.5" style={{ fontSize: '8px', opacity: 0.4 }}>{'\u00b7'}</span>}
                  <span style={{ fontSize: '11px', letterSpacing: '2.5px', textTransform: 'lowercase', fontWeight: i === 0 ? 400 : 300, opacity: i === 0 ? 0.7 : 0.4 }}>
                    {space}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="w-full px-3 md:px-4" style={{ maxWidth: '880px' }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {GHOST_TILES.map((tile, idx) => (
                <div
                  key={idx}
                  className={`${tile.span === 2 ? 'col-span-2' : 'col-span-1'} ${tile.aspect} relative overflow-hidden rounded-2xl animate-ghost-pulse`}
                  style={{
                    background: theme.colors.glass,
                    border: `1px solid ${theme.colors.border}`,
                    animationDelay: `${idx * 1.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ghost serial — unclaimed, waiting */}
      <div
        className="fixed bottom-4 left-4 z-10 select-none pointer-events-none font-mono"
        style={{ color: theme.colors.textMuted, fontSize: '11px', fontWeight: 300, opacity: 0.2 }}
      >
        #????
      </div>

      <div className="relative z-10 w-full flex flex-col items-center">
        {children}
      </div>
    </div>
  )

  // Processing state (waiting for Stripe finalization)
  if (step === 'processing') {
    return (
      <ClaimShell>
        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
        <p className="mt-4 text-white/30 text-[13px]">claiming...</p>
      </ClaimShell>
    )
  }

  // Ceremony — serial illumination
  if (step === 'ceremony' && serial && finalSlug) {
    return (
      <ClaimCeremony
        serial={serial}
        slug={finalSlug}
        onComplete={() => setStep('done')}
      />
    )
  }

  // Done — claimed!
  if (step === 'done') {
    return (
      <ClaimShell>
        <div className="w-full max-w-xs text-center">
          {serial && (
            <p className="font-mono text-white/25 text-[11px] tracking-[0.2em] uppercase mb-6">
              FP #{serial.toLocaleString()}
            </p>
          )}

          <p className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3">
            you&apos;re live
          </p>

          <p className="font-mono text-[13px] mb-8">
            <span className="text-white/40">footprint.onl/</span><span className="text-white/90">{finalSlug}</span>
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
      </ClaimShell>
    )
  }

  // Username + promo step
  return (
    <ClaimShell>
      <div className="w-full max-w-xs">
        <div className="space-y-4">
          {/* Username */}
          <div>
            <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <span className="text-white/20 text-[13px] pl-4 shrink-0">fp.onl/</span>
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
              <button
                onClick={handlePublish}
                disabled={loading || !available || !username.trim()}
                className="pr-4 text-white/40 text-[18px] hover:text-white/70 transition-colors disabled:opacity-30"
                aria-label="Submit"
              >
                {loading ? '...' : '\u2192'}
              </button>
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
        </div>

        <p className="text-center text-white/90 text-[28px] mt-8" style={{ fontWeight: 500 }}>
          $10
        </p>
        <p className="text-center text-white/30 text-[13px] mt-1" style={{ fontWeight: 300 }}>
          permanent.
        </p>

        <p className="mt-8 text-center text-white/15 text-[11px]">
          one-time. no subscription. yours forever.
        </p>
      </div>
    </ClaimShell>
  )
}
