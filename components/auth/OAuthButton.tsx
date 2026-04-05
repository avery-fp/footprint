'use client'

import { useState } from 'react'

interface OAuthButtonProps {
  provider: 'google' | 'apple'
  label: string
}

export default function OAuthButton({ provider, label }: OAuthButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)

    try {
      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setLoading(false)
    }
  }

  const icon = provider === 'google' ? (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 22" fill="currentColor">
      <path d="M14.94 0C13.4.08 11.58 1.04 10.56 2.3c-.93 1.12-1.7 2.82-1.4 4.46 1.66.05 3.38-.9 4.36-2.18.92-1.18 1.6-2.84 1.42-4.58ZM18 16.14c-.44 1.02-.66 1.47-1.23 2.37-.8 1.26-1.93 2.83-3.33 2.84-1.24.02-1.56-.81-3.24-.8-1.68.01-2.03.82-3.27.81-1.4-.02-2.47-1.41-3.27-2.67C1.7 15.07 1.5 10.84 3.08 8.6c1.12-1.59 2.9-2.53 4.56-2.53 1.5 0 2.44.82 3.68.82 1.2 0 1.93-.82 3.66-.82 1.48 0 3.06.8 4.17 2.19-3.66 2.01-3.07 7.24.85 8.88Z"/>
    </svg>
  )

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="touch-manipulation"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        width: '100%',
        padding: '16px 20px',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 0,
        color: 'rgba(255,255,255,0.6)',
        fontSize: '10px',
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        fontFamily: 'inherit',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'border-color 200ms ease, color 200ms ease',
        opacity: loading ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
        e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
      }}
    >
      {icon}
      <span>{loading ? '...' : label}</span>
    </button>
  )
}
