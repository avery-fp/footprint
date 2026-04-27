/**
 * Aspect detection context — used by SAspectShell (provider) + TileImage (consumer).
 *
 * SAspectShell wraps S image tiles in the public grid and manages a detected-aspect
 * state that starts from the stored aspect (or 'square') and updates once the image
 * fires onLoad with its natural dimensions.
 *
 * TileImage reads this context and fires the callback when naturalWidth/naturalHeight
 * are available. If no SAspectShell is in the tree, the context value is null and
 * TileImage skips the callback entirely.
 */
import { createContext, useContext } from 'react'

export type DetectedAspect = 'portrait' | 'landscape' | 'square'

export const AspectDetectionContext = createContext<((a: DetectedAspect) => void) | null>(null)

export const useAspectDetection = () => useContext(AspectDetectionContext)
