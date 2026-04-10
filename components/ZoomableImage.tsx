'use client'

import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'

interface ZoomableImageProps {
  children: ReactNode
  className?: string
  maxScale?: number
  onZoomChange?: (zoomed: boolean) => void
}

export default function ZoomableImage({
  children,
  className,
  maxScale = 3,
  onZoomChange,
}: ZoomableImageProps) {
  const [scale, setScale] = useState(1)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null)
  const zoomed = scale > 1.01

  useEffect(() => {
    onZoomChange?.(zoomed)
  }, [onZoomChange, zoomed])

  const getRelativePosition = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return { x: 50, y: 50 }
    const rect = el.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    }
  }, [])

  const clampTranslate = useCallback((x: number, y: number, nextScale: number) => {
    const el = containerRef.current
    if (!el || nextScale <= 1) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const maxX = Math.max(0, (rect.width * (nextScale - 1)) / 2)
    const maxY = Math.max(0, (rect.height * (nextScale - 1)) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    panStartRef.current = null
    pinchStartRef.current = null
  }, [])

  const zoomAtPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const pos = getRelativePosition(clientX, clientY)
    setOrigin(pos)
    setScale(nextScale)
    setTranslate({ x: 0, y: 0 })
  }, [getRelativePosition])

  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  const getTouchMidpoint = (touches: React.TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  })

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (zoomed) {
      resetZoom()
      return
    }
    zoomAtPoint(e.clientX, e.clientY, 2)
  }, [zoomAtPoint, zoomed, resetZoom])

  // Pan while zoomed
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const midpoint = getTouchMidpoint(e.touches)
      setOrigin(getRelativePosition(midpoint.x, midpoint.y))
      pinchStartRef.current = {
        distance: getTouchDistance(e.touches),
        scale,
      }
      panStartRef.current = null
      return
    }
    if (!zoomed || e.touches.length !== 1) return
    const t = e.touches[0]
    panStartRef.current = { x: t.clientX, y: t.clientY, tx: translate.x, ty: translate.y }
  }, [getRelativePosition, scale, translate, zoomed])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault()
      const distance = getTouchDistance(e.touches)
      const nextScale = Math.max(1, Math.min(maxScale, pinchStartRef.current.scale * (distance / pinchStartRef.current.distance)))
      setScale(nextScale)
      setTranslate(prev => clampTranslate(prev.x, prev.y, nextScale))
      return
    }
    if (!zoomed || !panStartRef.current || e.touches.length !== 1) return
    e.preventDefault()
    const t = e.touches[0]
    const dx = t.clientX - panStartRef.current.x
    const dy = t.clientY - panStartRef.current.y
    setTranslate(
      clampTranslate(
        panStartRef.current.tx + dx,
        panStartRef.current.ty + dy,
        scale
      )
    )
  }, [clampTranslate, maxScale, scale, zoomed])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartRef.current = null
    }
    if (e.touches.length === 1 && zoomed) {
      const t = e.touches[0]
      panStartRef.current = { x: t.clientX, y: t.clientY, tx: translate.x, ty: translate.y }
      return
    }
    if (e.touches.length === 0) {
      panStartRef.current = null
      if (scale <= 1.01) resetZoom()
    }
  }, [resetZoom, scale, translate.x, translate.y, zoomed])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!zoomed) return
    panStartRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y }
    const handleMouseMove = (ev: MouseEvent) => {
      if (!panStartRef.current) return
      setTranslate(
        clampTranslate(
          panStartRef.current.tx + (ev.clientX - panStartRef.current.x),
          panStartRef.current.ty + (ev.clientY - panStartRef.current.y),
          scale
        )
      )
    }
    const handleMouseUp = () => {
      panStartRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [clampTranslate, scale, translate, zoomed])

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-hidden touch-manipulation ${className || ''}`}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: zoomed ? 'grab' : 'zoom-in',
        touchAction: zoomed ? 'none' : 'manipulation',
      }}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={zoomed ? handleMouseDown : undefined}
    >
      <div
        className="w-full h-full"
        style={{
          width: '100%',
          height: '100%',
          transform: zoomed
            ? `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`
            : 'scale(1)',
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition: panStartRef.current || pinchStartRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          willChange: zoomed ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}
