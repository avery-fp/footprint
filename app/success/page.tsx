'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { loadDraft, clearDraft } from '@/lib/draft-store'

const DM = "'DM Sans', sans-serif"

type Step = 'processing' | 'welcome' | 'password' | 'error'

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session_id')
  const slug = searchParams.get('slug')

  const [step, setStep] = useState<Step>('processing')
  const [serialNumber, setSerialNumber] = useState<number | null>(null)
  const [userSlug, setUserSlug] = useState<string | null>(slug)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function handleSuccess() {
      if (!sessionId) {
        setErrorMessage('Missing session information')
        setStep('error')
        return
      }

      // Path A: Draft-based flow (user built a page before paying)
      if (slug) {
        const draft = loadDraft(slug)
        if (draft) {
          try {
            const res = await fetch('/api/import-draft', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: sessionId, slug, draft }),
            })
            const data = await res.json()
            if (res.ok && data.success) {
              setSerialNumber(data.serial_number)
              setUserSlug(slug)
              clearDraft(slug)
              setStep('welcome')
              return
            }
          } catch {
            // Draft import failed, fall through to activate path
          }
        }
      }

      // Path B: Activate flow (webhook created user, we just need a session cookie)
      try {
        const res = await fetch('/api/checkout/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data = await res.json()

        if (res.ok && data.success) {
          setSerialNumber(data.serial)
          setUserSlug(data.slug)
          setStep('welcome')
          return
        }

        // Webhook may be slow — retry once after 3s
        await new Promise(r => setTimeout(r, 3000))
        const retry = await fetch('/api/checkout/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const retryData = await retry.json()

        if (retry.ok && retryData.success) {
          setSerialNumber(retryData.serial)
          setUserSlug(retryData.slug)
          setStep('welcome')
          return
        }

        setErrorMessage(retryData.error || 'Failed to activate account')
        setStep('error')
      } catch {
        setErrorMessage('Network error. Please try again.')
        setStep('error')
      }
    }

    handleSuccess()
  }, [sessionId, slug])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || password.length < 6) {
      toast.error('6 characters minimum')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push(userSlug ? `/${userSlug}/home` : '/dashboard')
      } else {
        toast.error('Failed to set password')
        setSaving(false)
      }
    } catch {
      toast.error('Failed')
      setSaving(false)
    }
  }

  const skipToPage = () => {
    router.push(userSlug ? `/${userSlug}/home` : '/dashboard')
  }

  // Processing spinner
  if (step === 'processing') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>
        <div className="fixed inset-0 bg-[#080808]" />
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/50 animate-spin mx-auto mb-6" />
          <p className="text-white/20 text-xs" style={{ fontFamily: DM }}>
            setting up your footprint...
          </p>
        </div>
      </div>
    )
  }

  // Error
  if (step === 'error') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>
        <div className="fixed inset-0 bg-[#080808]" />
        <div className="relative z-10 w-full max-w-xs text-center">
          <p
            className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3"
            style={{ fontFamily: DM }}
          >
            something went wrong
          </p>
          <p className="text-white/30 text-[13px] mb-8" style={{ fontFamily: DM }}>
            {errorMessage}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all"
            style={{ fontFamily: DM }}
          >
            try again
          </button>
        </div>
      </div>
    )
  }

  // Welcome → set password
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>
      <div className="fixed inset-0 bg-[#080808]" />
      <div className="relative z-10 w-full max-w-xs text-center">
        {/* Serial number */}
        {serialNumber && (
          <p
            className="font-mono text-white/25 text-[11px] tracking-[0.2em] uppercase mb-6"
            style={{ fontFamily: DM }}
          >
            FP #{serialNumber.toLocaleString()}
          </p>
        )}

        <p
          className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3"
          style={{ fontFamily: DM }}
        >
          {step === 'welcome' ? "you're live" : 'set a password'}
        </p>

        {step === 'welcome' && (
          <>
            <p className="text-white/30 text-[13px] leading-relaxed mb-10" style={{ fontFamily: DM }}>
              your page is public. set a password<br />so you can sign in and edit it.
            </p>
            <button
              onClick={() => setStep('password')}
              className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all mb-3"
              style={{ fontFamily: DM, minHeight: '48px' }}
            >
              set password
            </button>
            <button
              onClick={skipToPage}
              className="w-full py-3 text-white/20 text-[12px] hover:text-white/40 transition-colors"
              style={{ fontFamily: DM }}
            >
              skip for now
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <p className="text-white/30 text-[13px] leading-relaxed mb-8" style={{ fontFamily: DM }}>
              you can also sign in with a magic link anytime.
            </p>
            <form onSubmit={handleSetPassword} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password (6+ characters)"
                className="w-full bg-white/[0.05] border border-white/[0.06] rounded-xl px-4 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/15 text-[16px] text-center"
                style={{ fontFamily: DM, minHeight: '48px', lineHeight: '48px', padding: '0 16px' }}
                autoFocus
                minLength={6}
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
                style={{ fontFamily: DM, minHeight: '48px' }}
              >
                {saving ? '...' : 'continue'}
              </button>
            </form>
            <button
              onClick={skipToPage}
              className="mt-4 text-white/15 text-[11px] hover:text-white/30 transition-colors"
              style={{ fontFamily: DM }}
            >
              skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}
