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

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768
}

// ── Toast style (dark, matching void aesthetic) ────────────────

const TOAST_STYLE = {
  background: '#111111',
  color: '#F5F5F5',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '13px',
}

// ── Share icon SVG (iOS-style, minimal) ────────────────────────

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 5, opacity: 0.6 }}
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

// ── Global prompt catcher (no UI, mount in layout) ─────────────

export function InstallPromptCatcher() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (e: Event) => {
      e.preventDefault()
      ;(window as any).__fp_deferred_prompt = e
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installed = () => {
      localStorage.setItem('fp_installed', 'true')
      ;(window as any).__fp_deferred_prompt = null
      toast('Your deed is placed.', { style: TOAST_STYLE })
    }
    window.addEventListener('appinstalled', installed)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  return null
}

// ── Main component (render in editor, mobile only) ─────────────

export default function AddToHomeScreen() {
  const [visible, setVisible] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [platform, setPlatform] = useState<Platform>('unsupported')
  const iosModalShown = useRef(false)

  useEffect(() => {
    // Desktop: never show
    if (!isMobileDevice()) return

    // Already installed or standalone
    if (isStandalone()) return
    if (localStorage.getItem('fp_installed') === 'true') return
    if (localStorage.getItem('fp_a2hs_dismissed') === 'true') return
    if (localStorage.getItem('fp_ios_a2hs_seen') === 'true') return

    setPlatform(getPlatform())

    // Appear after a quiet beat — the user is already in the editor
    const timer = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  // ── iOS: detect return from Safari share flow ──
  useEffect(() => {
    if (platform !== 'ios' || !iosModalShown.current) return

    const handler = () => {
      if (document.visibilityState === 'visible' && iosModalShown.current) {
        iosModalShown.current = false
        localStorage.setItem('fp_ios_a2hs_seen', 'true')
        setShowModal(false)
        setVisible(false)
        toast('Your deed is placed.', { style: TOAST_STYLE })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [platform])

  const handleClick = useCallback(async () => {
    const p = getPlatform()

    // Android: fire native prompt
    if (p === 'android' && (window as any).__fp_deferred_prompt) {
      const prompt = (window as any).__fp_deferred_prompt
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      ;(window as any).__fp_deferred_prompt = null
      if (outcome === 'accepted') {
        localStorage.setItem('fp_installed', 'true')
        setVisible(false)
      }
      return
    }

    // iOS or fallback: show modal
    setShowModal(true)
    if (p === 'ios') iosModalShown.current = true
  }, [])

  const dismiss = useCallback(() => {
    setShowModal(false)
    localStorage.setItem('fp_a2hs_dismissed', 'true')
    setVisible(false)
    if (platform === 'ios') {
      localStorage.setItem('fp_ios_a2hs_seen', 'true')
    }
  }, [platform])

  if (!visible) return null

  return (
    <>
      {/* ── Inline CTA — sits in the editor flow ── */}
      <button
        onClick={handleClick}
        style={{
          display: 'block',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '20px 0 8px',
          cursor: 'pointer',
          color: 'rgba(255, 255, 255, 0.2)',
          fontSize: '12px',
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.03em',
          textAlign: 'center',
          transition: 'color 0.3s ease, opacity 0.6s ease',
          opacity: 1,
        }}
      >
        Place Footprint on your Home Screen
      </button>

      {/* ── Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={dismiss}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 300,
              width: '100%',
              margin: '0 24px',
              background: '#111111',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '28px 24px',
              textAlign: 'center',
              animation: 'fadeIn 0.25s ease-out',
            }}
          >
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
              color: 'rgba(255, 255, 255, 0.35)',
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1.6,
              margin: '14px 0 0 0',
            }}>
              {platform === 'ios' ? (
                <><ShareIcon />Tap Share, then &lsquo;Add to Home Screen&rsquo;</>
              ) : (
                <>Use your browser menu to add to Home Screen</>
              )}
            </p>

            <button
              onClick={dismiss}
              style={{
                marginTop: 24,
                background: 'none',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                padding: '7px 18px',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
                transition: 'color 0.2s ease, border-color 0.2s ease',
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
