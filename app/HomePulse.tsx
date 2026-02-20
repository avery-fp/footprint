'use client'

import { useEffect, useState } from 'react'

interface PulseData {
  next_serial: number
  total_claimed: number
  remaining: number
  recent: { serial: number; ago: string }[]
}

export default function HomePulse() {
  const [pulse, setPulse] = useState<PulseData | null>(null)
  const [tickerIndex, setTickerIndex] = useState(0)

  useEffect(() => {
    fetch('/api/pulse')
      .then(r => r.json())
      .then(d => { if (d.next_serial) setPulse(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!pulse || pulse.recent.length <= 1) return
    const interval = setInterval(() => {
      setTickerIndex(i => (i + 1) % pulse.recent.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [pulse])

  if (!pulse || pulse.total_claimed === 0) return null

  const current = pulse.recent[tickerIndex]

  return (
    <div
      className="mt-10 flex items-center gap-4"
      style={{ animation: 'fadeUp 0.6s ease-out 0.5s backwards' }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 animate-pulse flex-shrink-0" />

      {current && (
        <p
          className="text-white/15 text-xs transition-opacity duration-300"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          #{current.serial.toLocaleString()} claimed {current.ago}
        </p>
      )}

      <span className="text-white/8">·</span>

      <p
        className="text-white/10 text-xs"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {pulse.remaining.toLocaleString()} left
      </p>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
