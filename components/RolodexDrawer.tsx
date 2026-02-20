'use client'

import { useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useRolodex } from '@/store/useRolodex'
import { MOTION } from '@/lib/motion'

interface RolodexDrawerProps {
  open: boolean
  onClose: () => void
}

export function RolodexDrawer({ open, onClose }: RolodexDrawerProps) {
  const { slugs, loaded, hydrate } = useRolodex()
  const reducedMotion = useReducedMotion()
  const drawerRef = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)

  useEffect(() => { hydrate() }, [hydrate])

  const { drawer } = MOTION

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Basic swipe-down to close
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startY.current === null) return
      const dy = e.changedTouches[0].clientY - startY.current
      if (dy > 60) onClose()
      startY.current = null
    },
    [onClose],
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="rolodex-backdrop"
            className="fixed inset-0 z-[60]"
            style={{ backdropFilter: `blur(${drawer.backdropBlur}px)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: drawer.duration } }}
            exit={{ opacity: 0, transition: { duration: drawer.duration } }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            key="rolodex-drawer"
            ref={drawerRef}
            role="dialog"
            aria-label="Saved footprints"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[70vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-black/80 backdrop-blur-2xl border-t border-white/[0.08]"
            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            animate={
              reducedMotion
                ? { opacity: 1 }
                : {
                    y: 0,
                    transition: {
                      duration: drawer.duration,
                      ease: drawer.easing,
                    },
                  }
            }
            exit={
              reducedMotion
                ? { opacity: 0 }
                : {
                    y: '100%',
                    transition: {
                      duration: drawer.duration,
                      ease: drawer.easing,
                    },
                  }
            }
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-8 h-[3px] rounded-full bg-white/[0.15]" />
            </div>

            {/* Grid */}
            <div className="px-4 pb-6">
              {loaded && slugs.length === 0 ? (
                <p className="text-center text-white/20 text-[13px] py-10">
                  empty
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slugs.map((s) => (
                    <a
                      key={s}
                      href={`/${s}`}
                      className="aspect-square rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/40 text-[13px] font-medium tracking-wide hover:bg-white/[0.1] transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      {s}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
