'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'

type ArtifactKind = 'motion' | 'gallery' | 'text' | 'link'

interface ArtifactShellProps {
  children: ReactNode
  kind: ArtifactKind
  open: boolean
  onClose: () => void
  metadata?: ReactNode
}

export default function ArtifactShell({
  children,
  kind,
  open,
  onClose,
  metadata,
}: ArtifactShellProps) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  const ambientGlow = kind === 'gallery'
    ? 'radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 42%)'
    : 'radial-gradient(circle at top, rgba(245,215,178,0.06), transparent 38%)'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          aria-modal="true"
          role="dialog"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <motion.button
            type="button"
            aria-label="Dismiss artifact"
            className="absolute inset-0"
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(2, 2, 2, 0.88)',
              backdropFilter: 'blur(28px) saturate(110%)',
              WebkitBackdropFilter: 'blur(28px) saturate(110%)',
            }}
          />

          <div
            className="pointer-events-none absolute inset-0"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: ambientGlow }}
          />

          <motion.button
            type="button"
            onClick={onClose}
            aria-label="Close artifact viewer"
            className="absolute right-4 top-4 z-[3] inline-flex h-10 min-w-[40px] items-center justify-center rounded-full px-3 text-[11px] uppercase tracking-[0.18em] text-white/68 transition hover:text-white"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute',
              right: 16,
              top: 16,
              zIndex: 3,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 40,
              height: 40,
              paddingInline: 12,
              borderRadius: 9999,
              color: 'rgba(255,255,255,0.68)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(14px) saturate(120%)',
              WebkitBackdropFilter: 'blur(14px) saturate(120%)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            close
          </motion.button>

          <div
            className="relative z-[2] flex h-full w-full items-center justify-center px-4 py-6 md:px-8 md:py-8"
            style={{
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              height: '100%',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 16px',
            }}
          >
            {children}
          </div>

          {metadata ? (
            <motion.div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex justify-center px-4 pb-5 md:pb-7"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{
                pointerEvents: 'none',
                position: 'absolute',
                insetInline: 0,
                bottom: 0,
                zIndex: 2,
                display: 'flex',
                justifyContent: 'center',
                padding: '0 16px 20px',
              }}
            >
              <div
                className="max-w-[min(40rem,calc(100vw-2rem))] rounded-[20px] px-4 py-3 text-center"
                style={{
                  maxWidth: 'min(40rem, calc(100vw - 2rem))',
                  borderRadius: 20,
                  padding: '12px 16px',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(18px) saturate(125%)',
                  WebkitBackdropFilter: 'blur(18px) saturate(125%)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {metadata}
              </div>
            </motion.div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
