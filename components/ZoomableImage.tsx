'use client'

import { useRef, useState, useCallback, type ReactNode } from 'react'
import { MOTION } from '@/lib/motion'
import { haptic } from '@/lib/haptics'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface ZoomableImageProps {
  children: ReactNode
}

type ZoomLevel = 1 | 2 | 3

export default function ZoomableImage({ children }: ZoomableImageProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(1)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const lastTapRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  // Guard: on mobile, both onTouchEnd and onClick fire per tap. Without this,
  // the near-zero delta between them falsely triggers double-tap detection.
  const touchHandledRef = useRef(false)
  const reducedMotion = useReducedMotion()

  const isZoomed = zoomLevel > 1

  const getRelativePosition = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return { x: 50, y: 50 }
    const rect = el.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    }
  }, [])

  const handleTap = useCallback((clientX: number, clientY: number) => {
    const now = Date.now()
    const delta = now - lastTapRef.current
    lastTapRef.current = now

    if (delta < 300) {
      // Double-tap: cycle 1 → 2 → 3 → 1
      lastTapRef.current = 0 // Reset to prevent triple-tap

      if (zoomLevel === 1) {
        setOrigin(getRelativePosition(clientX, clientY))
        setTranslate({ x: 0, y: 0 })
        haptic('light')
        setZoomLevel(2)
      } else if (zoomLevel === 2) {
        haptic('medium')
        setZoomLevel(3)
      } else {
        setTranslate({ x: 0, y: 0 })
        setZoomLevel(1)
      }
    } else if (isZoomed) {
      // Single tap while zoomed → dismiss
      setTranslate({ x: 0, y: 0 })
      setZoomLevel(1)
    }
  }, [zoomLevel, isZoomed, getRelativePosition])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (touchHandledRef.current) {
      touchHandledRef.current = false
      return
    }
    handleTap(e.clientX, e.clientY)
  }, [handleTap])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) return
    const touch = e.changedTouches[0]
    if (touch) {
      touchHandledRef.current = true
      handleTap(touch.clientX, touch.clientY)
    }
  }, [handleTap])

  // Pan while zoomed
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isZoomed || e.touches.length !== 1) return
    const t = e.touches[0]
    panStartRef.current = { x: t.clientX, y: t.clientY, tx: translate.x, ty: translate.y }
  }, [isZoomed, translate])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isZoomed || !panStartRef.current || e.touches.length !== 1) return
    e.preventDefault()
    const t = e.touches[0]
    const dx = t.clientX - panStartRef.current.x
    const dy = t.clientY - panStartRef.current.y
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const frac = (zoomLevel - 1) / zoomLevel
    const maxX = rect.width * frac
    const maxY = rect.height * frac
    setTranslate({
      x: Math.max(-maxX, Math.min(maxX, panStartRef.current.tx + dx)),
      y: Math.max(-maxY, Math.min(maxY, panStartRef.current.ty + dy)),
    })
  }, [isZoomed, zoomLevel])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isZoomed) return
    const currentZoom = zoomLevel
    panStartRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y }
    const handleMouseMove = (ev: MouseEvent) => {
      if (!panStartRef.current) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const frac = (currentZoom - 1) / currentZoom
      const maxX = rect.width * frac
      const maxY = rect.height * frac
      setTranslate({
        x: Math.max(-maxX, Math.min(maxX, panStartRef.current.tx + (ev.clientX - panStartRef.current.x))),
        y: Math.max(-maxY, Math.min(maxY, panStartRef.current.ty + (ev.clientY - panStartRef.current.y))),
      })
    }
    const handleMouseUp = () => {
      panStartRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [isZoomed, translate, zoomLevel])

  const { zoom } = MOTION
  const transition = panStartRef.current || reducedMotion
    ? 'none'
    : isZoomed
      ? `transform ${zoom.in}, filter 0.3s ease`
      : `transform ${zoom.out}, filter 0.3s ease`

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden touch-manipulation"
      style={{ cursor: isZoomed ? 'grab' : 'default' }}
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onMouseDown={isZoomed ? handleMouseDown : undefined}
    >
      <div
        className="w-full h-full"
        style={{
          transform: isZoomed
            ? `scale(${zoomLevel}) translate(${translate.x / zoomLevel}px, ${translate.y / zoomLevel}px)`
            : 'scale(1)',
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition,
          filter: isZoomed ? 'brightness(1.04)' : 'brightness(1)',
          willChange: isZoomed ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}
