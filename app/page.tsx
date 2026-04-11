'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AUTH_ENTRY } from '@/lib/routes'

export default function LandingPage() {
  const [vis, setVis] = useState(false)
  const [price, setPrice] = useState('$10')

  useEffect(() => {
    const t = setTimeout(() => setVis(true), 300)
    fetch('/api/geo')
      .then(r => r.json())
      .then(d => { if (d.price) setPrice(d.price) })
      .catch(() => {})
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '0 0 8vh',
      }}
    >
      {/* Grid hero image */}
      <div
        style={{
          width: 'min(84vw, 520px)',
          aspectRatio: '3 / 2',
          borderRadius: '20px',
          overflow: 'hidden',
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 1s ease, transform 1s ease',
          background: '#111',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/grid-hero.png"
          alt="footprint grid"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      </div>

      {/* Tagline */}
      <p
        style={{
          marginTop: '52px',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 'clamp(15px, 2.5vw, 18px)',
          fontWeight: 300,
          letterSpacing: '0.04em',
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.8s ease 0.2s, transform 0.8s ease 0.2s',
        }}
      >
        all of you. one place. {price}.
      </p>

      {/* CTA */}
      <Link
        href={AUTH_ENTRY}
        style={{
          marginTop: '40px',
          padding: '14px 44px',
          background: 'white',
          color: '#0a0a0a',
          borderRadius: '8px',
          fontSize: 'clamp(13px, 2vw, 14px)',
          fontWeight: 400,
          letterSpacing: '0.04em',
          textDecoration: 'none',
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.8s ease 0.35s, transform 0.8s ease 0.35s, background 0.2s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.88)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
      >
        Home
      </Link>

      {/* See example */}
      <Link
        href="/ae"
        style={{
          marginTop: '24px',
          color: 'rgba(255,255,255,0.18)',
          fontSize: '13px',
          letterSpacing: '0.04em',
          textDecoration: 'none',
          opacity: vis ? 1 : 0,
          transition: 'opacity 0.8s ease 0.5s, color 0.2s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.18)' }}
      >
        see one →
      </Link>
    </div>
  )
}
