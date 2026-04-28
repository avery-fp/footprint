'use client'

import { useEffect, useState } from 'react'

/**
 * FloatingCtaBar — quiet "Make yours →" CTA on every public footprint.
 * Hidden at the top of the page; fades in once the visitor has scrolled past
 * an early threshold so it never competes with the first impression.
 */
export default function FloatingCtaBar({ isOwner = false }: { isOwner?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isOwner) return
    const onScroll = () => setVisible(window.scrollY > 80)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isOwner])

  if (isOwner) return null

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
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        paddingTop: '64px',
        background: 'linear-gradient(to top, rgba(8,8,10,0.78) 0%, rgba(8,8,10,0.45) 50%, rgba(8,8,10,0) 100%)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <button
        onClick={handleMakeYours}
        disabled={loading}
        style={{
          pointerEvents: visible ? 'auto' : 'none',
          background: 'transparent',
          border: 'none',
          padding: '8px 14px',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
          fontWeight: 400,
          letterSpacing: '0.01em',
          color: 'rgba(244, 236, 222, 0.78)',
          textShadow: '0 0 24px rgba(244, 236, 222, 0.18)',
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.55 : 1,
          transition: 'opacity 0.2s ease, color 0.2s ease',
        }}
        onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.color = 'rgba(244, 236, 222, 1)' }}
        onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.color = 'rgba(244, 236, 222, 0.78)' }}
      >
        {loading ? 'preparing…' : 'make yours →'}
      </button>
    </div>
  )
}
