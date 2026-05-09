'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * RoomLockOverlay — visitor-facing 4-digit passcode pad.
 *
 * Surfaces over a locked room when a non-owner visitor navigates into
 * it. The room's tiles still render behind, fully glassmorphism-blurred
 * so the shape is recognizable but content is unreadable. The pad
 * floats centered.
 *
 * Doctrine: incorrect code → gentle shake, no rate limit. Correct code
 * → sessionStorage flag set, overlay dismisses for the tab's lifetime.
 * Closing the tab re-locks on next paint.
 */

interface RoomLockOverlayProps {
  /**
   * Async passcode verifier. Receives the 4-digit string, returns true
   * if accepted. Implemented by PublicPage as a POST to
   * /api/rooms/[id]/unlock.
   */
  onSubmit: (code: string) => Promise<boolean>
  /** Fires once after a successful submit. */
  onCorrect: () => void
}

export default function RoomLockOverlay({ onSubmit, onCorrect }: RoomLockOverlayProps) {
  const [code, setCode] = useState('')
  const [shaking, setShaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-submit when 4 digits are entered.
  useEffect(() => {
    if (code.length !== 4 || busy) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const ok = await onSubmit(code)
        if (cancelled) return
        if (ok) {
          onCorrect()
        } else {
          setShaking(true)
          setTimeout(() => { if (!cancelled) { setShaking(false); setCode('') ; inputRef.current?.focus() } }, 420)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [code, busy, onSubmit, onCorrect])

  return (
    <div
      className="fixed inset-0 z-[42] flex items-center justify-center"
      style={{
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <div
        className="flex flex-col items-center"
        style={{
          animation: shaking ? 'fp-shake 0.42s cubic-bezier(.36,.07,.19,.97) both' : undefined,
        }}
      >
        {/* Four cell visual indicator. Live pin display. */}
        <div className="flex items-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.45)',
                background: i < code.length ? 'rgba(255,255,255,0.85)' : 'transparent',
                transition: 'background 120ms ease',
              }}
            />
          ))}
        </div>

        {/* Hidden numeric input drives the pin display. Visible to
            screen readers; keyboard users can type directly. Mobile
            users get a number-pad keyboard via inputMode. */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, 4)
            setCode(next)
          }}
          autoComplete="one-time-code"
          aria-label="passcode"
          className="absolute opacity-0 pointer-events-none"
          style={{ width: 1, height: 1 }}
        />

        {/* Visible numeric pad — 3×4 grid. Tap a digit to type, ⌫ to
            clear last. Same affordance for keyboard + touch. */}
        <div
          className="grid grid-cols-3 gap-1 font-mono"
          style={{
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCode((prev) => (prev + String(n)).slice(0, 4))}
              className="touch-manipulation"
              style={{
                width: 64,
                height: 56,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.85)',
                fontSize: 22,
                fontWeight: 300,
                letterSpacing: '0.02em',
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              {n}
            </button>
          ))}
          <span aria-hidden="true" />
          <button
            type="button"
            onClick={() => setCode((prev) => (prev + '0').slice(0, 4))}
            className="touch-manipulation"
            style={{
              width: 64,
              height: 56,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 22,
              fontWeight: 300,
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            0
          </button>
          <button
            type="button"
            aria-label="delete last digit"
            onClick={() => setCode((prev) => prev.slice(0, -1))}
            className="touch-manipulation"
            style={{
              width: 64,
              height: 56,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 16,
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            ⌫
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fp-shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-4px); }
          40%, 60% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}
