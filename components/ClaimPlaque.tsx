'use client'

import { MouseEventHandler } from 'react'

/**
 * ClaimPlaque — the jurisdiction marker between draft and authored.
 *
 * Not a CTA. A sealed state object that names what the room is (Draft) and what
 * it can become (Go live  $10). Quiet at rest, precise under attention, final
 * when engaged. Lives at the top-right of the builder chrome on desktop;
 * slots into the header action row on mobile.
 *
 * Design language is deliberate restraint:
 *  - shape: 14px-radius rectangle (the rest of the chrome is pills; shape is
 *    the whole design vocabulary here)
 *  - material: smoked graphite behind a saturated blur, single hairline border
 *  - motion: none at rest, border/text sharpen one step on hover, no transform
 *  - copy casing: title-case "Draft" (authored), not tracked uppercase (status-chip)
 *
 * Hidden entirely when the room is published, and during arrange mode — the
 * plaque is a draft-only object, and liveness is expressed by the public URL
 * existing, not by a congratulatory chrome element.
 */
export default function ClaimPlaque({
  onClick,
  loading = false,
  disabled = false,
  className = '',
}: {
  onClick: MouseEventHandler<HTMLButtonElement>
  loading?: boolean
  disabled?: boolean
  className?: string
}) {
  const effectiveOpacity = loading ? 0.6 : disabled ? 0.3 : 1
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      aria-label="Go live — $10"
      className={[
        // Layout
        'group font-mono flex flex-col items-start justify-center gap-0.5',
        // Border (default + hover/focus/active sharpen) — Tailwind arbitrary values
        // so we control opacity step-by-step without fighting inline styles.
        'border border-[rgba(255,255,255,0.12)]',
        'hover:border-[rgba(255,255,255,0.22)]',
        'focus-visible:border-[rgba(255,255,255,0.22)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
        'active:border-[rgba(255,255,255,0.26)]',
        // Background press step
        'active:bg-[rgba(8,8,10,0.82)]',
        // Motion
        'transition-[border-color,background-color,color] duration-150 ease-out',
        'disabled:cursor-default',
        className,
      ].join(' ')}
      style={{
        minHeight: '52px',
        padding: '10px 14px',
        borderRadius: '14px',
        background: 'rgba(10, 10, 12, 0.72)',
        backdropFilter: 'blur(18px) saturate(120%)',
        WebkitBackdropFilter: 'blur(18px) saturate(120%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.22)',
        opacity: effectiveOpacity,
      }}
    >
      <span
        className="text-white/[0.85] group-hover:text-white transition-colors duration-150 ease-out"
        style={{
          fontSize: '13px',
          fontWeight: 500,
          letterSpacing: '0.01em',
          lineHeight: 1.15,
        }}
      >
        {loading ? '...' : 'go live \u2192 $10'}
      </span>
    </button>
  )
}
