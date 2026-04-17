'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

/**
 * TEXT EXPAND TILE — Universal E-State for text
 *
 * Spec: AE Presentation Layer — Task 1
 *
 * DORMANT: glass surface in the grid, text clamped to `dormantLines`.
 * ACTIVE: Z-axis pull-forward — full-screen overlay, dim/blurred void behind,
 * scrollable text inside a reading-width container. Dismiss via backdrop tap,
 * Escape key, or back button. Heavy, calm spring. No bouncy energy.
 */

interface TextExpandTileProps {
  text: string
  /** Controls dormant typography scale — inherits existing `thought` tile sizing. */
  isPublicView?: boolean
  /** Dormant clamp. Spec says 3. Kept configurable for future text surfaces. */
  dormantLines?: number
}

export default function TextExpandTile({
  text,
  isPublicView = false,
  dormantLines = 3,
}: TextExpandTileProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const reducedMotion = useReducedMotion()

  // Dormant typography — matches the existing `thought` tile scale (6/20/60 char breakpoints).
  const len = text.length
  const dormantTypo =
    len <= 6
      ? 'text-[28px] font-light tracking-[-0.035em] leading-none'
      : len <= 20
      ? 'text-[18px] font-light tracking-[-0.025em] leading-tight'
      : len <= 60
      ? 'text-[15px] font-light tracking-[-0.01em] leading-snug'
      : 'text-[15px] font-light tracking-[-0.01em] leading-relaxed'

  const close = useCallback(() => setIsExpanded(false), [])

  const dormantSurface = isPublicView
    ? {
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px) saturate(120%)',
        WebkitBackdropFilter: 'blur(20px) saturate(120%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        minHeight: '200px',
      }
    : undefined

  const baseClasses = isPublicView
    ? 'w-full h-full flex items-center justify-center p-5 cursor-pointer transition-opacity hover:opacity-95'
    : 'w-full h-full fp-tile fp-surface flex items-center justify-center p-5 cursor-pointer transition-opacity hover:opacity-95'

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded(true)
          }
        }}
        className={baseClasses}
        style={dormantSurface}
      >
        <p
          className={`whitespace-pre-wrap text-center ${isPublicView ? 'text-white' : 'opacity-85'} ${dormantTypo}`}
          style={{
            fontWeight: 300,
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: dormantLines,
            overflow: 'hidden',
          }}
        >
          {text}
        </p>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <ExpandedOverlay
            key="text-expand-overlay"
            text={text}
            onDismiss={close}
            reducedMotion={!!reducedMotion}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ════════════════════════════════════════
// EXPANDED OVERLAY — portal + void + reading surface
// ════════════════════════════════════════

function ExpandedOverlay({
  text,
  onDismiss,
  reducedMotion,
}: {
  text: string
  onDismiss: () => void
  reducedMotion: boolean
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  // Back button — push state, pop dismisses
  useEffect(() => {
    history.pushState({ textExpand: true }, '')
    const onPop = () => onDismiss()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onDismiss])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (!mounted) return null

  // Heavy calm spring, matching MOTION.theatre easing (0.16, 1, 0.3, 1). No bounce.
  const enter = reducedMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }
  const exit = reducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={enter}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      {/* Backdrop — softer dim so the expansion reads as a card lift, not a takeover */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(12px) saturate(90%)',
          WebkitBackdropFilter: 'blur(12px) saturate(90%)',
        }}
        onClick={onDismiss}
      />

      {/* Reading surface — contained card, breathing room around it on mobile */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={enter}
        className="relative z-10 w-full max-w-[560px] max-h-[70vh] overflow-y-auto overflow-x-hidden mx-5 px-6 py-8 rounded-2xl"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          background: 'rgba(20, 20, 20, 0.72)',
          backdropFilter: 'blur(16px) saturate(120%)',
          WebkitBackdropFilter: 'blur(16px) saturate(120%)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="whitespace-pre-wrap text-white/90 text-[16px] md:text-[18px] text-center"
          style={{
            fontWeight: 300,
            lineHeight: 1.6,
            letterSpacing: '-0.01em',
          }}
        >
          {text}
        </p>
      </motion.div>

      {/* Minimal X — upper right */}
      <button
        onClick={onDismiss}
        className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        aria-label="Close"
      >
        <svg
          className="w-4 h-4 text-white/60"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={exit}
      />
    </motion.div>,
    document.body,
  )
}
