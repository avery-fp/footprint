'use client'

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { motion } from 'framer-motion'

/**
 * TEXT EXPAND TILE — in-place pop-over expansion.
 *
 * Dormant: glass surface in the grid, text clamped to `dormantLines`.
 * Expanded: the tile lifts in place (absolute within its grid cell, z-raised),
 * grows downward to fit the text up to a max-height, scrolls internally past that.
 * Tap again, tap outside, or Escape to collapse.
 */

interface TextExpandTileProps {
  text: string
  isPublicView?: boolean
  /** Dormant clamp. Spec says 3. */
  dormantLines?: number
}

export default function TextExpandTile({
  text,
  isPublicView = false,
  dormantLines = 3,
}: TextExpandTileProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Drag guard: distinguish a clean tap from a scroll/drag gesture.
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const didDragRef = useRef(false)

  const len = text.length
  const dormantTypo =
    len <= 6
      ? 'text-[28px] font-light tracking-[-0.035em] leading-none'
      : len <= 20
      ? 'text-[18px] font-light tracking-[-0.025em] leading-tight'
      : len <= 60
      ? 'text-[15px] font-light tracking-[-0.01em] leading-snug'
      : 'text-[15px] font-light tracking-[-0.01em] leading-relaxed'

  const collapse = useCallback(() => setIsExpanded(false), [])
  const toggle = useCallback(() => setIsExpanded((v) => !v), [])

  // Pointer-movement guard: if the pointer travels >6px between down and up,
  // treat it as a scroll/drag and suppress the toggle.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    didDragRef.current = false
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = pointerStartRef.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > 36) didDragRef.current = true
  }, [])
  const onClick = useCallback(() => {
    if (didDragRef.current) {
      didDragRef.current = false
      pointerStartRef.current = null
      return
    }
    pointerStartRef.current = null
    toggle()
  }, [toggle])

  // Escape collapses when expanded
  useEffect(() => {
    if (!isExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isExpanded, collapse])

  // Outside click collapses when expanded
  useEffect(() => {
    if (!isExpanded) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        collapse()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [isExpanded, collapse])

  // Detect actual overflow so the bottom fade only applies when there is more text below.
  useLayoutEffect(() => {
    if (!isExpanded) {
      setOverflows(false)
      return
    }
    const el = scrollRef.current
    if (!el) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [isExpanded, text])

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
    ? 'flex items-center justify-center p-5 cursor-pointer transition-opacity hover:opacity-95 rounded-2xl'
    : 'fp-tile fp-surface flex items-center justify-center p-5 cursor-pointer transition-opacity hover:opacity-95 rounded-2xl'

  // When expanded, lift the tile above siblings within its grid cell's stacking context.
  // Cell retains its aspect; the tile grows downward only.
  const expandedPositionStyle = isExpanded
    ? ({
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        zIndex: 30,
        height: 'auto',
      } as const)
    : ({ position: 'relative', width: '100%', height: '100%' } as const)

  return (
    <motion.div
      ref={rootRef}
      layout
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
      className={baseClasses}
      style={{ ...dormantSurface, ...expandedPositionStyle }}
    >
      {isExpanded ? (
        <div
          ref={scrollRef}
          className="w-full"
          style={{
            maxHeight: 'min(480px, 70vh)',
            overflowY: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            ...(overflows
              ? {
                  maskImage:
                    'linear-gradient(to bottom, black calc(100% - 16px), transparent 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, black calc(100% - 16px), transparent 100%)',
                }
              : null),
          }}
        >
          <p
            className={`whitespace-pre-wrap text-center ${isPublicView ? 'text-white' : 'opacity-90'}`}
            style={{
              fontSize: 16,
              fontWeight: 300,
              lineHeight: 1.6,
              letterSpacing: '-0.01em',
              paddingBottom: overflows ? 16 : 0,
            }}
          >
            {text}
          </p>
        </div>
      ) : (
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
      )}
    </motion.div>
  )
}
