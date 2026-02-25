'use client'

import { useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useRolodex } from '@/store/useRolodex'
import { haptic } from '@/lib/haptics'
import { MOTION } from '@/lib/motion'

interface PlusButtonProps {
  slug: string
}

export function PlusButton({ slug }: PlusButtonProps) {
  const { has, add, loaded, hydrate } = useRolodex()
  const adding = useRef(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => { hydrate() }, [hydrate])

  const inRolodex = loaded && has(slug)

  const handleTap = useCallback(async () => {
    if (adding.current || inRolodex) return
    adding.current = true
    haptic('light')
    await add(slug)
    // adding stays true — button unmounts
  }, [slug, inRolodex, add])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleTap()
      }
    },
    [handleTap],
  )

  // Don't render until store is hydrated
  if (!loaded) return null

  const { plus } = MOTION

  return (
    <AnimatePresence>
      {!inRolodex && (
        <motion.button
          key="plus"
          onClick={handleTap}
          onKeyDown={handleKeyDown}
          aria-label="Add to your Rolodex"
          role="button"
          tabIndex={0}
          className="w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.3)] flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/30 touch-manipulation"
          initial={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={
            reducedMotion
              ? { opacity: 0 }
              : {
                  scale: [...plus.scale],
                  opacity: [...plus.opacity],
                  rotate: plus.rotate[1],
                  transition: {
                    duration: plus.duration,
                    ease: plus.easing,
                  },
                }
          }
          whileTap={{ scale: 0.95 }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 1v12M1 7h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-white/60"
            />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
