'use client'

import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * ARTIFACT SHELL — Modal overlay for lazy-mounted embeds
 *
 * The Z-axis expansion surface. Grid blurs, shell pulls forward.
 * Embed loads INSIDE the shell. Scroll is contained.
 * Dismiss snaps back. Embed unmounts. Grid returns clean.
 */

interface ArtifactShellProps {
  onDismiss: () => void
  fallbackUrl?: string
  children: React.ReactNode
}

export default function ArtifactShell({ onDismiss, fallbackUrl, children }: ArtifactShellProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll + push history for back button
  useEffect(() => {
    history.pushState({ artifactShell: true }, '')
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  // Back button
  useEffect(() => {
    const onPop = () => onDismiss()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onDismiss])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ animation: 'artifact-shell-in 0.3s ease-out' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      {/* Backdrop — blur + dim */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(24px) saturate(80%)',
          WebkitBackdropFilter: 'blur(24px) saturate(80%)',
        }}
      />

      {/* Content container — scroll INSIDE, no page reflow */}
      <div
        className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl mx-4"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>

      {/* Close button */}
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
        <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Fallback link — always accessible */}
      {fallbackUrl && (
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-white/30 hover:text-white/60 transition-colors text-[11px] tracking-wider uppercase"
          style={{ fontWeight: 500 }}
        >
          Open original →
        </a>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes artifact-shell-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `,
      }} />
    </div>,
    document.body,
  )
}
