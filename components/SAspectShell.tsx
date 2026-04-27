'use client'

/**
 * SAspectShell — aspect-aware grid cell for S image tiles.
 *
 * Wraps the outer grid cell div for S (size=1) image tiles in the public grid.
 * Starts from the stored aspect (or 'square' if unknown), then updates once
 * TileImage fires the detected aspect via AspectDetectionContext.
 *
 * Container-first doctrine: shape the cell to match the content, then let
 * object-cover fill naturally. No contain, no black bars, no forced square crop.
 */

import { useState, useCallback } from 'react'
import { AspectDetectionContext, type DetectedAspect } from '@/lib/aspectDetection'

const ASPECT_CLASS: Record<DetectedAspect, string> = {
  portrait: 'aspect-[3/4]',
  landscape: 'aspect-[4/3]',
  square: 'aspect-square',
}

/** Map the resolved aspect string (from resolveAspect()) to DetectedAspect. */
function toDetected(resolved: string): DetectedAspect {
  if (resolved === 'portrait' || resolved === 'tall') return 'portrait'
  if (resolved === 'landscape' || resolved === 'wide') return 'landscape'
  return 'square'
}

interface SAspectShellProps {
  /** Resolved aspect string from resolveAspect() — used as initial state. */
  initialAspect: string
  children: React.ReactNode
}

export default function SAspectShell({ initialAspect, children }: SAspectShellProps) {
  const [detected, setDetected] = useState<DetectedAspect>(() => toDetected(initialAspect))

  const handleDetected = useCallback((a: DetectedAspect) => {
    setDetected(prev => (prev === a ? prev : a))
  }, [])

  return (
    <AspectDetectionContext.Provider value={handleDetected}>
      <div className={ASPECT_CLASS[detected]}>
        {children}
      </div>
    </AspectDetectionContext.Provider>
  )
}
