'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * CONTAINER DEPTH EXPANSION — Z-axis navigation for container tiles ONLY
 *
 * Tap a container tile on the street → it scales to ~85% viewport center.
 * Siblings dim to 10% opacity. Child tiles render inside the expanded viewport.
 * Close via X button, backdrop tap, Escape, back button, or swipe-down.
 *
 * Uses in-place CSS transforms (no remount, iframes stay alive).
 * Leaf tiles are WINDOWS — they never expand. Containers are DOORS.
 */

interface ExpandedContainer {
  id: string
  transform: string
}

interface ChildTile {
  id: string
  type: string
  url: string
  title?: string | null
  description?: string | null
  thumbnail_url?: string | null
  embed_html?: string | null
  position: number
  size: number
  aspect?: string | null
  caption?: string | null
  source: 'library' | 'links'
  render_mode?: string
  artist?: string | null
  thumbnail_url_hq?: string | null
  media_id?: string | null
}

export function useDepthExpansion() {
  const [expanded, setExpanded] = useState<ExpandedContainer | null>(null)
  const [showOverlay, setShowOverlay] = useState(false)
  const [children, setChildren] = useState<ChildTile[]>([])
  const [loadingChildren, setLoadingChildren] = useState(false)
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

    // Fetch children
    setLoadingChildren(true)
    fetch(`/api/containers?id=${id}`)
      .then(r => r.json())
      .then(data => setChildren(data.children || []))
      .catch(() => setChildren([]))
      .finally(() => setLoadingChildren(false))

    setTimeout(() => { animatingRef.current = false }, 550)
  }, [expanded])

  const collapse = useCallback(() => {
    if (!expanded) return
    animatingRef.current = true
    setExpanded(null)
    document.body.style.overflow = ''
    setTimeout(() => {
      setShowOverlay(false)
      setChildren([])
      animatingRef.current = false
    }, 400)
  }, [expanded])

  // Escape key
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') collapse() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, collapse])

  // Back button (push fake history entry)
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

  return { expanded, showOverlay, children, loadingChildren, expand, collapse, registerRef }
}
