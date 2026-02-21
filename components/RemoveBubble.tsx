'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useRolodex } from '@/store/useRolodex'
import { haptic } from '@/lib/haptics'
import { MOTION } from '@/lib/motion'
import { useLongPress } from '@/hooks/useLongPress'

interface RemoveBubbleProps {
  slug: string
  children: React.ReactNode
}

export function RemoveBubble({ slug, children }: RemoveBubbleProps) {
  const { has, remove, loaded } = useRolodex()
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  const { bubble: timing } = MOTION

  const clearBubble = useCallback(() => {
    setBubble(null)
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }, [])

  const onLongPress = useCallback(
    (x: number, y: number) => {
      if (!loaded || !has(slug)) return
      haptic('medium')

      // Position relative to container
      const rect = containerRef.current?.getBoundingClientRect()
      const relX = rect ? x - rect.left + timing.offsetX : x
      const relY = rect ? y - rect.top + timing.offsetY : y

      setBubble({ x: relX, y: relY })

      dismissTimer.current = setTimeout(() => {
        setBubble(null)
      }, timing.linger)
    },
    [loaded, has, slug, timing],
  )

  const longPress = useLongPress({ onLongPress })

  const handleRemove = useCallback(() => {
    haptic('light')
    remove(slug)
    clearBubble()
  }, [slug, remove, clearBubble])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ touchAction: 'pan-y' }}
      {...longPress}
    >
      {children}

      <AnimatePresence>
        {bubble && (
          <motion.button
            key="remove-bubble"
            onClick={handleRemove}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleRemove()
              }
            }}
            aria-label="Remove from your Rolodex"
            tabIndex={0}
            className="absolute z-50 flex items-center justify-center h-7 px-3 rounded-full bg-white/[0.1] backdrop-blur-xl border border-white/[0.15] text-white/60 text-[11px] font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/30 touch-manipulation"
            style={{
              left: bubble.x,
              top: bubble.y,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={
              reducedMotion
                ? { opacity: 1, scale: 1 }
                : {
                    opacity: 1,
                    scale: 1,
                    transition: { duration: timing.fadeIn },
                  }
            }
            exit={
              reducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.9,
                    transition: { duration: timing.fadeOut },
                  }
            }
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
              className="mr-1"
            >
              <path
                d="M1 5h8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            remove
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
