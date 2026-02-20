'use client'

import { useRef, useCallback } from 'react'
import { MOTION } from '@/lib/motion'

interface LongPressResult {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerMove: (e: React.PointerEvent) => void
}

interface LongPressOptions {
  onLongPress: (x: number, y: number) => void
  threshold?: number
  moveCancel?: number
}

export function useLongPress({
  onLongPress,
  threshold = MOTION.longPress.threshold,
  moveCancel = MOTION.longPress.moveCancel,
}: LongPressOptions): LongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only primary pointer (touch, mouse left, stylus tip)
      if (e.button !== 0) return
      startRef.current = { x: e.clientX, y: e.clientY }

      timerRef.current = setTimeout(() => {
        if (startRef.current) {
          onLongPress(e.clientX, e.clientY)
        }
        clear()
      }, threshold)
    },
    [onLongPress, threshold, clear],
  )

  const onPointerUp = useCallback(() => clear(), [clear])
  const onPointerCancel = useCallback(() => clear(), [clear])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      const dx = e.clientX - startRef.current.x
      const dy = e.clientY - startRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > moveCancel) {
        clear()
      }
    },
    [moveCancel, clear],
  )

  return { onPointerDown, onPointerUp, onPointerCancel, onPointerMove }
}
