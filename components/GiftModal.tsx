'use client'

import { useState } from 'react'

interface GiftModalProps {
  onClose: () => void
  giftsRemaining: number
  onGiftSent: (remaining: number) => void
}

export default function GiftModal({ onClose, giftsRemaining, onGiftSent }: GiftModalProps) {
  const [email1, setEmail1] = useState('')
  const [email2, setEmail2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const email1Valid = emailRegex.test(email1)
  const email2Valid = !email2 || emailRegex.test(email2)
  const canSend = email1Valid && email2Valid && !loading

  const handleSend = async () => {
    if (!canSend) return
    setLoading(true)
    setError('')

    const emails = [email1.trim()]
    if (email2.trim()) emails.push(email2.trim())

    if (emails.length > giftsRemaining) {
      setError(`You have ${giftsRemaining} gift(s) left`)
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/gifts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })

      const data = await res.json()

      if (data.success) {
        setSuccess(true)
        onGiftSent(data.remaining)
      } else {
        setError(data.error || 'Failed to send')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-xs mx-6 rounded-2xl border border-white/[0.08] p-6"
        style={{ background: 'rgba(10, 10, 10, 0.95)' }}
      >
        {success ? (
          <div className="text-center">
            <p className="text-[18px] font-light text-white/90 mb-2">sent</p>
            <p className="text-white/30 text-[13px] leading-relaxed mb-6">
              they&apos;ll get an email with a claim link.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/[0.08] text-white/70 text-[14px] hover:bg-white/[0.12] transition-all"
            >
              done
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <p className="text-[18px] font-light text-white/90 mb-1">gift a footprint</p>
              <p className="text-white/25 text-[11px] font-mono">
                {giftsRemaining} remaining
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                placeholder="their email"
                value={email1}
                onChange={(e) => { setEmail1(e.target.value); setError('') }}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 text-[14px]"
                autoFocus
              />

              {giftsRemaining >= 2 && (
                <input
                  type="email"
                  placeholder="another email (optional)"
                  value={email2}
                  onChange={(e) => { setEmail2(e.target.value); setError('') }}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 text-[14px]"
                />
              )}

              {error && (
                <p className="text-red-400/70 text-[13px] text-center">{error}</p>
              )}

              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-full py-3 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? '...' : 'send gift'}
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full mt-3 text-white/15 text-[11px] hover:text-white/30 transition-colors text-center py-2"
            >
              cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
