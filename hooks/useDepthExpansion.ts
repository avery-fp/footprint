'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * DEPTH TILE EXPANSION — Z-axis navigation
 *
 * Tap a tile on the street → tile scales to ~85% viewport (entering a room).
 * Siblings dim to 10% opacity + slight scale-down.
 * Close via X button, backdrop tap, Escape, or back button.
 * Only one expanded tile at a time.
 *
 * Uses in-place CSS transforms (no remount, iframes stay alive).
 */

interface ExpandedTile {
  id: string
  transform: string
}

export function useDepthExpansion() {
  const [expanded, setExpanded] = useState<ExpandedTile | null>(null)
  const [showOverlay, setShowOverlay] = useState(false)
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const animatingRef = useRef(false)

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) tileRefs.current.set(id, el)
    else tileRefs.current.delete(id)
  }, [])

  const expand = useCallback((id: string) => {
    if (expanded || animatingRef.current) return
    const el = tileRefs.current.get(id)
    if (!el) return

    animatingRef.current = true

    const rect = el.getBoundingClientRect()
    const vpW = window.innerWidth
    const vpH = window.innerHeight

    // Target: 92% width on mobile, 88% capped at 780px on desktop. 82% height.
    const maxW = vpW < 768 ? vpW * 0.92 : Math.min(vpW * 0.88, 780)
    const maxH = vpH * 0.82
    const scale = Math.min(maxW / rect.width, maxH / rect.height, 5)

    const tx = vpW / 2 - (rect.left + rect.width / 2)
    const ty = vpH / 2 - (rect.top + rect.height / 2)

    setExpanded({
      id,
      transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`,
    })
    setShowOverlay(true)
    document.body.style.overflow = 'hidden'

    setTimeout(() => { animatingRef.current = false }, 550)
  }, [expanded])

  const collapse = useCallback(() => {
    if (!expanded) return
    animatingRef.current = true
    setExpanded(null)
    document.body.style.overflow = ''
    setTimeout(() => {
      setShowOverlay(false)
      animatingRef.current = false
    }, 400)
  }, [expanded])

  // Escape key closes depth
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') collapse() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, collapse])

  // Back button closes depth (push fake history entry)
  useEffect(() => {
    if (!expanded) return
    history.pushState({ depth: 1 }, '')
    const onPop = () => collapse()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [expanded, collapse])

  // Viewport resize / rotation → collapse
  useEffect(() => {
    if (!expanded) return
    const onResize = () => collapse()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [expanded, collapse])

  return { expanded, showOverlay, expand, collapse, registerRef }
}
