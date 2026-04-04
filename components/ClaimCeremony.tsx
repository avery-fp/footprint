'use client'

import { useState, useEffect, useCallback } from 'react'

const DM = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

interface ClaimCeremonyProps {
  serial: number
  slug: string
  onComplete: () => void
}

/**
 * Claim Ceremony — serial illumination + stamp
 *
 * Phased reveal:
 *   0–400ms   dark void, radial glow fades in
 *   400–1600  serial deblurs + scales in
 *   1600–2800 illumination sweep across serial text
 *   2800–3600 tagline + URL fade up
 *   3600+     continue button, auto-advance 5s
 *
 * Tap to skip after phase 1. Respects prefers-reduced-motion.
 */
export default function ClaimCeremony({ serial, slug, onComplete }: ClaimCeremonyProps) {
  const [phase, setPhase] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  const serialDisplay = `#${serial.toString().padStart(4, '0')}`

  // Check reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      setReducedMotion(true)
      setPhase(4)
    }
  }, [])

  // Phase progression timer
  useEffect(() => {
    if (reducedMotion) return

    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 2800),
      setTimeout(() => setPhase(4), 3600),
    ]

    return () => timers.forEach(clearTimeout)
  }, [reducedMotion])

  // Auto-advance after 5s from phase 4
  useEffect(() => {
    if (phase < 4) return
    const t = setTimeout(onComplete, reducedMotion ? 3000 : 5000)
    return () => clearTimeout(t)
  }, [phase, onComplete, reducedMotion])

  // Tap to skip (available after phase 1)
  const handleClick = useCallback(() => {
    if (phase >= 1) onComplete()
  }, [phase, onComplete])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{
        background: '#050505',
        cursor: phase >= 1 ? 'pointer' : 'default',
      }}
      onClick={handleClick}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.04) 0%, transparent 70%)',
          opacity: phase >= 1 ? 1 : 0,
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-0">
        {/* Serial number — the main event */}
        <h1
          className={reducedMotion ? '' : phase >= 2 ? 'ceremony-serial ceremony-illuminate' : phase >= 1 ? 'ceremony-serial ceremony-serial-enter' : 'ceremony-serial'}
          style={{
            fontFamily: DM,
            fontSize: 'clamp(64px, 14vw, 120px)',
            fontWeight: 300,
            letterSpacing: '-0.04em',
            lineHeight: 0.9,
            color: 'rgba(255,255,255,0.9)',
            opacity: reducedMotion ? 1 : phase >= 1 ? undefined : 0,
            willChange: 'transform, opacity, filter',
          }}
        >
          {serialDisplay}
        </h1>

        {/* Tagline — fades up after illuminate */}
        <p
          className={reducedMotion ? '' : phase >= 3 ? 'ceremony-tagline ceremony-tagline-enter' : 'ceremony-tagline'}
          style={{
            fontFamily: DM,
            fontSize: '15px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.2)',
            marginTop: '24px',
            opacity: reducedMotion ? 1 : phase >= 3 ? undefined : 0,
          }}
        >
          yours. permanent.
        </p>

        {/* URL */}
        <p
          className={reducedMotion ? '' : phase >= 3 ? 'ceremony-tagline ceremony-tagline-enter' : 'ceremony-tagline'}
          style={{
            fontFamily: MONO,
            fontSize: '13px',
            color: 'rgba(255,255,255,0.15)',
            marginTop: '8px',
            letterSpacing: '0.02em',
            opacity: reducedMotion ? 1 : phase >= 3 ? undefined : 0,
            animationDelay: phase >= 3 && !reducedMotion ? '200ms' : undefined,
          }}
        >
          footprint.onl/{slug}
        </p>

        {/* Continue */}
        <button
          className={reducedMotion ? '' : phase >= 4 ? 'ceremony-tagline ceremony-tagline-enter' : 'ceremony-tagline'}
          onClick={(e) => {
            e.stopPropagation()
            onComplete()
          }}
          style={{
            fontFamily: MONO,
            fontSize: '11px',
            color: 'rgba(255,255,255,0.25)',
            marginTop: '48px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: reducedMotion ? 1 : phase >= 4 ? undefined : 0,
            animationDelay: phase >= 4 && !reducedMotion ? '200ms' : undefined,
            transition: 'color 0.3s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
        >
          continue
        </button>
      </div>
    </div>
  )
}
