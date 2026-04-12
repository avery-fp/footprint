'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * VIDEO EXPANSION — three-stage state machine for video tiles
 *
 * tile → theatre → fullscreen
 *
 * Theatre: video breaks out of tile, centers at ~85vw, backdrop dims.
 * Fullscreen: native browser Fullscreen API.
 * iPhone: no Fullscreen API — theatre is max level.
 *
 * Mirrors gesture patterns from useDepthExpansion (Escape, back button,
 * backdrop tap, swipe-down, resize → collapse).
 */

export type VideoMode = 'tile' | 'theatre' | 'fullscreen'

interface UseVideoExpansionReturn {
  mode: VideoMode
  escalate: () => void
  collapse: () => void
  isExpanded: boolean
}

// iPhone detection — Fullscreen API is not supported on iPhone Safari
const isIPhone = () =>
  typeof navigator !== 'undefined' && /iPhone/.test(navigator.userAgent)

// Vendor-prefixed fullscreen helpers
function requestFS(el: HTMLElement) {
  if (el.requestFullscreen) return el.requestFullscreen()
  if ((el as any).webkitRequestFullscreen) return (el as any).webkitRequestFullscreen()
  return Promise.reject(new Error('Fullscreen not supported'))
}

function exitFS() {
  if (document.exitFullscreen) return document.exitFullscreen()
  if ((document as any).webkitExitFullscreen) return (document as any).webkitExitFullscreen()
  return Promise.reject(new Error('Fullscreen not supported'))
}

function getFullscreenElement(): Element | null {
  return document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? null
}

export function useVideoExpansion(
  theatreContainerRef: React.RefObject<HTMLDivElement | null>,
): UseVideoExpansionReturn {
  const [mode, setMode] = useState<VideoMode>('tile')
  const animatingRef = useRef(false)
  const modeRef = useRef(mode)
  modeRef.current = mode

  const isExpanded = mode !== 'tile'

  const collapse = useCallback(() => {
    if (modeRef.current === 'tile') return
    // If in fullscreen, exit fullscreen first — the fullscreenchange listener
    // will then call collapse again to go from theatre → tile.
    if (modeRef.current === 'fullscreen' && getFullscreenElement()) {
      exitFS().catch(() => {})
      return
    }
    setMode('tile')
    document.body.style.overflow = ''
  }, [])

  const escalate = useCallback(() => {
    if (animatingRef.current) return

    if (modeRef.current === 'tile') {
      animatingRef.current = true
      setMode('theatre')
      document.body.style.overflow = 'hidden'
      history.pushState({ videoTheatre: true }, '')
      setTimeout(() => { animatingRef.current = false }, 450)
      return
    }

    if (modeRef.current === 'theatre') {
      // iPhone has no Fullscreen API — theatre is max
      if (isIPhone()) return
      const el = theatreContainerRef.current
      if (!el) return
      requestFS(el).then(() => setMode('fullscreen')).catch(() => {})
      return
    }
  }, [theatreContainerRef])

  // Fullscreen exit → drop to theatre (not tile)
  useEffect(() => {
    const handler = () => {
      if (!getFullscreenElement() && modeRef.current === 'fullscreen') {
        setMode('theatre')
      }
    }
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [])

  // Escape key — theatre → tile (fullscreen Escape is handled by browser first)
  useEffect(() => {
    if (mode !== 'theatre') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, collapse])

  // Back button
  useEffect(() => {
    if (mode !== 'theatre') return
    const onPop = () => collapse()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [mode, collapse])

  // Viewport resize → collapse
  useEffect(() => {
    if (!isExpanded) return
    const onResize = () => collapse()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isExpanded, collapse])

  // Cleanup: restore scroll on unmount if expanded
  useEffect(() => {
    return () => {
      if (modeRef.current !== 'tile') {
        document.body.style.overflow = ''
      }
    }
  }, [])

  return { mode, escalate, collapse, isExpanded }
}
