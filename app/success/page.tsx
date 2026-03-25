'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { loadDraft, clearDraft } from '@/lib/draft-store'

type Step = 'publishing' | 'welcome' | 'password' | 'error'

export default function SuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session_id')
  const slug = searchParams.get('slug')

  const [step, setStep] = useState<Step>('publishing')
  const [serialNumber, setSerialNumber] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const pageUrl = slug ? `https://footprint.onl/${slug}` : ''

  useEffect(() => {
    async function publishDraft() {
      if (!sessionId || !slug) {
        setErrorMessage('Missing session or page information')
        setStep('error')
        return
      }

      const draft = loadDraft(slug)
      if (!draft) {
        setErrorMessage('No draft found. You may have already published.')
        setStep('error')
        return
      }

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
          setStep('welcome')
        } else {
          setErrorMessage(data.error || 'Failed to publish')
          setStep('error')
        }
      } catch {
        setErrorMessage('Network error. Please try again.')
        setStep('error')
      }
    }

    publishDraft()
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
        router.push(`/${slug}/home`)
      } else {
        toast.error('Failed to set password')
        setSaving(false)
      }
    } catch {
      toast.error('Failed')
      setSaving(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      toast('copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url: pageUrl })
      } catch {
        // User cancelled share — ignore
      }
    } else {
      const text = encodeURIComponent(`just got my footprint → ${pageUrl}`)
      window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank')
    }
  }

  // Publishing spinner
  if (step === 'publishing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/50 animate-spin" />
      </div>
    )
  }

  // Error
  if (step === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs text-center">
          <p
            className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-3"
          >
            something went wrong
          </p>
          <p className="text-white/30 text-[13px] mb-8">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all"
          >
            try again
          </button>
        </div>
      </div>
    )
  }

  // Welcome → actions → password
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        {/* Serial number — proud */}
        {serialNumber && (
          <p className="font-mono text-white/25 text-[11px] tracking-[0.2em] uppercase mb-6">
            FP #{serialNumber.toLocaleString()}
          </p>
        )}

        {step === 'welcome' && (
          <>
            <p className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-2">
              you&apos;re live
            </p>

            {/* URL display */}
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-white/40 text-[13px] font-mono tracking-wide hover:text-white/60 transition-colors mb-10"
            >
              footprint.onl/{slug}
            </a>

            {/* Primary actions */}
            <div className="space-y-3">
              <button
                onClick={handleCopyLink}
                className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all active:scale-[0.99]"
              >
                {copied ? 'copied' : 'copy your link'}
              </button>

              <button
                onClick={handleShare}
                className="w-full py-3.5 rounded-xl text-[14px] font-medium transition-all active:scale-[0.99]"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'rgba(255, 255, 255, 0.8)',
                }}
              >
                share
              </button>

              <button
                onClick={() => router.push(`/${slug}/home`)}
                className="w-full py-3.5 rounded-xl text-[14px] font-medium transition-all active:scale-[0.99]"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  color: 'rgba(255, 255, 255, 0.6)',
                }}
              >
                start building &rarr;
              </button>
            </div>

            {/* Password — quiet link */}
            <button
              onClick={() => setStep('password')}
              className="mt-8 text-white/15 text-[11px] hover:text-white/30 transition-colors"
            >
              set a password
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <p className="text-[22px] font-light tracking-[-0.01em] text-white/90 mb-8">
              set a password
            </p>
            <form onSubmit={handleSetPassword} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password (6+ characters)"
                className="w-full bg-white/[0.05] border border-white/[0.06] rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/12 text-[14px] text-center"
                autoFocus
                minLength={6}
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3.5 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-40"
              >
                {saving ? '...' : 'continue'}
              </button>
            </form>
            <button
              onClick={() => router.push(`/${slug}/home`)}
              className="mt-4 text-white/15 text-[11px] hover:text-white/30 transition-colors"
            >
              skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}
