'use client'

import { useRef, useState, useCallback, type ReactNode } from 'react'

interface ZoomableImageProps {
  children: ReactNode
}

export default function ZoomableImage({ children }: ZoomableImageProps) {
  const [zoomed, setZoomed] = useState(false)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const lastTapRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

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
      // Double-tap
      if (zoomed) {
        setZoomed(false)
        setTranslate({ x: 0, y: 0 })
      } else {
        const pos = getRelativePosition(clientX, clientY)
        setOrigin(pos)
        setTranslate({ x: 0, y: 0 })
        setZoomed(true)
      }
      lastTapRef.current = 0 // Reset to prevent triple-tap
    } else if (zoomed) {
      // Single tap while zoomed → dismiss
      setZoomed(false)
      setTranslate({ x: 0, y: 0 })
    }
  }, [zoomed, getRelativePosition])

  const handleClick = useCallback((e: React.MouseEvent) => {
    handleTap(e.clientX, e.clientY)
  }, [handleTap])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) return
    const touch = e.changedTouches[0]
    if (touch) handleTap(touch.clientX, touch.clientY)
  }, [handleTap])

  // Pan while zoomed
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!zoomed || e.touches.length !== 1) return
    const t = e.touches[0]
    panStartRef.current = { x: t.clientX, y: t.clientY, tx: translate.x, ty: translate.y }
  }, [zoomed, translate])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!zoomed || !panStartRef.current || e.touches.length !== 1) return
    e.preventDefault()
    const t = e.touches[0]
    const dx = t.clientX - panStartRef.current.x
    const dy = t.clientY - panStartRef.current.y
    // Clamp to prevent panning beyond image edges (at 2x scale, max 50% of container in each dir)
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxX = rect.width * 0.5
    const maxY = rect.height * 0.5
    setTranslate({
      x: Math.max(-maxX, Math.min(maxX, panStartRef.current.tx + dx)),
      y: Math.max(-maxY, Math.min(maxY, panStartRef.current.ty + dy)),
    })
  }, [zoomed])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!zoomed) return
    panStartRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y }
    const handleMouseMove = (ev: MouseEvent) => {
      if (!panStartRef.current) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const maxX = rect.width * 0.5
      const maxY = rect.height * 0.5
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
  }, [zoomed, translate])

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden touch-manipulation"
      style={{ cursor: zoomed ? 'grab' : undefined }}
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onMouseDown={zoomed ? handleMouseDown : undefined}
    >
      <div
        className="w-full h-full"
        style={{
          transform: zoomed
            ? `scale(2) translate(${translate.x / 2}px, ${translate.y / 2}px)`
            : 'scale(1)',
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition: panStartRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          willChange: zoomed ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}
