'use client'

import { useEffect, useState } from 'react'

interface PulseData {
  next_serial: number
  total_claimed: number
  remaining: number
  recent: { serial: number; ago: string }[]
}

/**
 * HomePulse — client component that shows live social proof on the homepage.
 * Fetches from /api/pulse and displays recent claims + scarcity counter.
 * Renders with subtle animation, disappears if data is empty.
 */
export default function HomePulse() {
  const [pulse, setPulse] = useState<PulseData | null>(null)
  const [tickerIndex, setTickerIndex] = useState(0)

  useEffect(() => {
    fetch('/api/pulse')
      .then(r => r.json())
      .then(d => { if (d.next_serial) setPulse(d) })
      .catch(() => {})
  }, [])

  // Auto-rotate ticker
  useEffect(() => {
    if (!pulse || pulse.recent.length <= 1) return
    const interval = setInterval(() => {
      setTickerIndex(i => (i + 1) % pulse.recent.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [pulse])

  if (!pulse || pulse.total_claimed === 0) return null

  return (
    <div className="mt-10 flex items-center gap-4 animate-fade-up" style={{ animationDelay: '0.5s', animationFillMode: 'backwards' }}>
      {/* Live dot */}
      <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 animate-pulse flex-shrink-0" />

      {/* Ticker */}
      {pulse.recent.length > 0 && (
        <p
          className="text-white/15 text-xs"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
          key={tickerIndex}
        >
          #{pulse.recent[tickerIndex]?.serial.toLocaleString()} claimed {pulse.recent[tickerIndex]?.ago}
        </p>
      )}

      <span className="text-white/8">·</span>

      <p
        className="text-white/10 text-xs"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {pulse.remaining.toLocaleString()} left
      </p>
    </div>
  )
}
