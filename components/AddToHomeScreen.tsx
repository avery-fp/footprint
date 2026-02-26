'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

// ── Platform detection (SSR-safe) ──────────────────────────────

type Platform = 'ios' | 'android' | 'unsupported'

function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unsupported'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios'
  if (/Android/.test(ua) && /Chrome/.test(ua) && !/Edge|OPR|Samsung/.test(ua)) return 'android'
  return 'unsupported'
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if ((navigator as any).standalone === true) return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return false
}

// ── Share icon SVG (iOS-style, minimal) ────────────────────────

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6, opacity: 0.7 }}
    >
      <path
        d="M8 1.5V10M8 1.5L5 4.5M8 1.5L11 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 7V13.5H13V7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Component ──────────────────────────────────────────────────

export default function AddToHomeScreen() {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [platform, setPlatform] = useState<Platform>('unsupported')
  const deferredPrompt = useRef<any>(null)
  const iosModalShown = useRef(false)

  // ── Mount + platform detect ──
  useEffect(() => {
    setMounted(true)
    setPlatform(getPlatform())

    if (isStandalone()) {
      setInstalled(true)
      return
    }

    // Already installed / dismissed
    if (localStorage.getItem('fp_installed') === 'true') {
      setInstalled(true)
      return
    }
    if (localStorage.getItem('fp_a2hs_dismissed') === 'true') {
      setDismissed(true)
      return
    }
    // iOS: already seen prompt
    if (localStorage.getItem('fp_ios_a2hs_seen') === 'true') {
      setDismissed(true)
      return
    }
  }, [])

  // ── beforeinstallprompt (Android/Chromium) ──
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => {
      localStorage.setItem('fp_installed', 'true')
      setInstalled(true)
      toast('Your deed is placed.', {
        style: {
          background: '#111111',
          color: '#F5F5F5',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '13px',
        },
      })
    }
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  // ── iOS: detect return from Safari share flow ──
  useEffect(() => {
    if (platform !== 'ios' || !iosModalShown.current) return

    const handler = () => {
      if (document.visibilityState === 'visible' && iosModalShown.current) {
        iosModalShown.current = false
        localStorage.setItem('fp_ios_a2hs_seen', 'true')
        setShowModal(false)
        setDismissed(true)
        toast('Your deed is placed.', {
          style: {
            background: '#111111',
            color: '#F5F5F5',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
          },
        })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [platform])

  // ── CTA click ──
  const handleClick = useCallback(async () => {
    const p = getPlatform()

    if (p === 'android' && deferredPrompt.current) {
      deferredPrompt.current.prompt()
      const { outcome } = await deferredPrompt.current.userChoice
      deferredPrompt.current = null
      if (outcome === 'accepted') {
        localStorage.setItem('fp_installed', 'true')
        setInstalled(true)
      }
      return
    }

    // iOS or unsupported: show modal
    setShowModal(true)
    if (p === 'ios') iosModalShown.current = true
  }, [])

  // ── Modal dismiss ──
  const closeModal = useCallback(() => {
    setShowModal(false)
    if (platform === 'ios') {
      localStorage.setItem('fp_ios_a2hs_seen', 'true')
      setDismissed(true)
    }
  }, [platform])

  // ── Don't render on server, when installed, dismissed, or on desktop ──
  if (!mounted || installed || dismissed || platform === 'unsupported') return null

  return (
    <>
      {/* ── CTA Button — mobile only ── */}
      <button
        onClick={handleClick}
        className="fixed z-50 touch-manipulation"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 8px) + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '8px 16px',
          cursor: 'pointer',
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '11px',
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <ShareIcon /> Add to Home Screen
      </button>

      {/* ── Modal backdrop + card ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={closeModal}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 320,
              width: '100%',
              margin: '0 24px',
              background: '#111111',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '32px 28px',
              textAlign: 'center',
              animation: 'fadeIn 0.25s ease-out',
            }}
          >
            {platform === 'ios' ? (
              <>
                <p style={{
                  color: '#F5F5F5',
                  fontSize: 15,
                  fontWeight: 400,
                  fontFamily: 'Space Grotesk, system-ui, sans-serif',
                  lineHeight: 1.5,
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}>
                  Add Footprint to your Home Screen
                </p>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  lineHeight: 1.6,
                  margin: '16px 0 0 0',
                }}>
                  <ShareIcon />
                  Tap Share, then &lsquo;Add to Home Screen&rsquo;
                </p>
              </>
            ) : (
              <>
                <p style={{
                  color: '#F5F5F5',
                  fontSize: 15,
                  fontWeight: 400,
                  fontFamily: 'Space Grotesk, system-ui, sans-serif',
                  lineHeight: 1.5,
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}>
                  Add Footprint to your Home Screen
                </p>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  lineHeight: 1.6,
                  margin: '16px 0 0 0',
                }}>
                  Use your browser menu to add to Home Screen
                </p>
              </>
            )}

            <button
              onClick={closeModal}
              style={{
                marginTop: 28,
                background: 'none',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '8px 20px',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
                transition: 'color 0.2s ease, border-color 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
              }}
            >
              got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
