'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { humanError, humanUsernameReason } from '@/lib/errors'
import { getTheme } from '@/lib/themes'
import OAuthButton from '@/components/auth/OAuthButton'
import ClaimCeremony from '@/components/ClaimCeremony'

type Step = 'username' | 'processing' | 'ceremony' | 'done'

interface ClaimClientProps {
  authenticated: boolean
}

export default function ClaimClient({ authenticated }: ClaimClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const presetUsername = searchParams.get('username')

  const [step, setStep] = useState<Step>(
    authenticated && sessionId ? 'processing' : 'username'
  )
  const [username, setUsername] = useState(presetUsername || '')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [availReason, setAvailReason] = useState('')
  const [checking, setChecking] = useState(false)
  const [promo, setPromo] = useState('')
  const [loading, setLoading] = useState(false)
  const [serial, setSerial] = useState<number | null>(null)
  const [finalSlug, setFinalSlug] = useState('')

  // Finalize after Stripe payment redirect
  const finalizeCalledRef = useRef(false)
  useEffect(() => {
    if (!sessionId || !presetUsername || !authenticated) return
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
  }, [sessionId, presetUsername, authenticated])

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
      if (username.trim() && authenticated) checkUsername(username.trim())
    }, 400)
    return () => clearTimeout(timer)
  }, [username, checkUsername, authenticated])

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

  // Set post_auth_redirect cookie before OAuth
  const handleOAuth = (provider: 'google' | 'apple') => {
    document.cookie = 'post_auth_redirect=/claim; path=/; max-age=600; samesite=lax'
  }

  const theme = getTheme('midnight')

  // Shared shell — same for both phases, same gravity
  const ClaimShell = ({ children }: { children: React.ReactNode }) => (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      {/* Ghost serial */}
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

  // ── Processing (Stripe finalization) ──
  if (step === 'processing') {
    return (
      <ClaimShell>
        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
        <p className="mt-4 text-white/30 text-[13px]">claiming...</p>
      </ClaimShell>
    )
  }

  // ── Ceremony ──
  if (step === 'ceremony' && serial && finalSlug) {
    return (
      <ClaimCeremony
        serial={serial}
        slug={finalSlug}
        onComplete={() => setStep('done')}
      />
    )
  }

  // ── Done ──
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
            <span className="text-white/40">fp.onl/</span>
            <span className="text-white/90">{finalSlug}</span>
          </p>

          <button
            onClick={() => router.push(`/${finalSlug}/home`)}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all mb-3"
          >
            open your space
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

  // ══════════════════════════════════════════════
  // Phase 1: Not authenticated — sign in
  // ══════════════════════════════════════════════
  if (!authenticated) {
    return (
      <ClaimShell>
        <div className="w-full max-w-xs">
          <div className="space-y-3" onClick={() => handleOAuth('google')}>
            <OAuthButton provider="google" label="continue with google" />
          </div>
          <div className="mt-3" onClick={() => handleOAuth('apple')}>
            <OAuthButton provider="apple" label="continue with apple" />
          </div>

          <p className="text-center text-white/90 text-[28px] mt-10" style={{ fontWeight: 500 }}>
            $10
          </p>
          <p className="text-center text-white/30 text-[13px] mt-2" style={{ fontWeight: 300, letterSpacing: '3px' }}>
            permanent.
          </p>
          <p className="text-center text-white/15 text-[11px] mt-1" style={{ fontWeight: 300 }}>
            one-time. no subscription. yours forever.
          </p>
        </div>
      </ClaimShell>
    )
  }

  // ══════════════════════════════════════════════
  // Phase 2: Authenticated — claim username + pay
  // ══════════════════════════════════════════════
  return (
    <ClaimShell>
      <div className="w-full max-w-xs">
        <div className="space-y-4">
          {/* Username */}
          <div>
            <div
              className="flex items-center gap-0 rounded-xl overflow-hidden"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
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
                  <p className="text-red-400/70 text-[11px]">
                    {availReason ? humanUsernameReason(availReason) : 'taken'}
                  </p>
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
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          />
        </div>

        <p className="text-center text-white/90 text-[28px] mt-8" style={{ fontWeight: 500 }}>
          $10
        </p>
        <p className="text-center text-white/30 text-[13px] mt-2" style={{ fontWeight: 300, letterSpacing: '3px' }}>
          permanent.
        </p>
        <p className="text-center text-white/15 text-[11px] mt-1" style={{ fontWeight: 300 }}>
          one-time. no subscription. yours forever.
        </p>
      </div>
    </ClaimShell>
  )
}
