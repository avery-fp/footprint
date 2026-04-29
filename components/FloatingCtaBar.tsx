'use client'

import { useEffect, useState } from 'react'

/**
 * FloatingCtaBar — visitor-facing "Make yours →" CTA at the bottom of
 * every public footprint. Clicking creates an anonymous draft footprint
 * and drops the visitor into /{tempSlug}/home to start building.
 */
export default function FloatingCtaBar({ isOwner = false }: { isOwner?: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasScrolled, setHasScrolled] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const updateVisibility = () => {
      setHasScrolled(window.scrollY >= 80)
    }
    let lastTouchY: number | null = null
    const showFromScrollIntent = () => {
      if (window.scrollY < 80) setHasScrolled(true)
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 24) showFromScrollIntent()
    }
    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null
    }
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (lastTouchY === null || !touch) return
      const deltaY = lastTouchY - touch.clientY
      if (deltaY > 24) showFromScrollIntent()
      lastTouchY = touch.clientY
    }

    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    return () => {
      window.removeEventListener('scroll', updateVisibility)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setPrefersReducedMotion(media.matches)

    updateMotion()
    media.addEventListener('change', updateMotion)
    return () => media.removeEventListener('change', updateMotion)
  }, [])

  const visible = hasScrolled && !dismissed
  const motionTransition = prefersReducedMotion ? 'opacity 250ms ease' : 'opacity 360ms ease, transform 360ms ease'

  if (isOwner || dismissed) return null

  const handleMakeYours = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/draft/create', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data?.tempSlug) {
        window.location.href = `/${data.tempSlug}/home`
        return
      }
    } catch {
      // fall through
    }
    setLoading(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        padding: '48px 20px calc(18px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to top, rgba(5, 5, 5, 0.58) 0%, rgba(5, 5, 5, 0.28) 48%, rgba(5, 5, 5, 0) 100%)',
        opacity: visible ? 1 : 0,
        transform: prefersReducedMotion || visible ? 'translateY(0)' : 'translateY(8px)',
        transition: motionTransition,
        pointerEvents: 'none',
      }}
    >
      <div style={{ maxWidth: '220px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', pointerEvents: visible ? 'auto' : 'none' }}>
        <button
          onClick={handleMakeYours}
          disabled={loading}
          style={{
            minWidth: '156px',
            minHeight: '44px',
            padding: '10px 18px',
            borderRadius: '999px',
            background: 'rgba(255, 244, 224, 0.055)',
            color: 'rgba(255, 244, 224, 0.86)',
            fontSize: '14px',
            fontWeight: 400,
            letterSpacing: '0.01em',
            border: '1px solid rgba(255, 244, 224, 0.11)',
            boxShadow: '0 0 24px rgba(255, 232, 190, 0.08)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'color 180ms ease, border-color 180ms ease, background 180ms ease',
            touchAction: 'manipulation',
          }}
        >
          {loading ? 'preparing…' : 'make yours →'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,244,224,0.18)',
            fontSize: '11px',
            letterSpacing: '0.04em',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          not now
        </button>
      </div>
    </div>
  )
}
