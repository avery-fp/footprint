'use client'

import { useEffect, useState } from 'react'

interface ReferralBannerProps {
  serial: string
}

/**
 * Shows a subtle "Invited by #XXXX" banner when ?ref= is in the URL.
 * Creates social proof + acknowledgment of the referral chain.
 * Fades in, auto-dismisses after 5s, or click to dismiss.
 */
export default function ReferralBanner({ serial }: ReferralBannerProps) {
  const [refSerial, setRefSerial] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref && ref.startsWith('FP-')) {
      const num = ref.replace('FP-', '')
      // Don't show banner for self-referrals
      if (num !== serial) {
        setRefSerial(num)
        setTimeout(() => setVisible(true), 500)
        setTimeout(() => setVisible(false), 6000)
      }
    }
  }, [serial])

  if (!refSerial || !visible) return null

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-40 animate-fade-up cursor-pointer"
      onClick={() => setVisible(false)}
    >
      <div className="bg-white/[0.06] backdrop-blur-md border border-white/[0.08] rounded-full px-5 py-2 flex items-center gap-2">
        <span className="text-white/30 text-xs" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          invited by
        </span>
        <span className="font-mono text-white/50 text-xs">
          #{refSerial}
        </span>
        <span className="text-white/15 text-[10px]">·</span>
        <a
          href={`/checkout?ref=FP-${refSerial}`}
          className="text-white/40 hover:text-white/60 text-xs transition-colors"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
          onClick={(e) => e.stopPropagation()}
        >
          Home
        </a>
      </div>
    </div>
  )
}
