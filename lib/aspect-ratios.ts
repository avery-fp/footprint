// ═══════════════════════════════════════════
// Aspect Ratio Intelligence
// Auto-snap uploaded content to the closest preset.
// Every tile gets a grid span (cols × rows) based on its detected shape.
// ═══════════════════════════════════════════

export const ASPECT_PRESETS = {
  square:    { ratio: 1,    cols: 1, rows: 1, label: '1:1' },
  portrait:  { ratio: 0.75, cols: 1, rows: 2, label: '3:4' },
  landscape: { ratio: 1.5,  cols: 2, rows: 1, label: '3:2' },
  wide:      { ratio: 2,    cols: 2, rows: 1, label: '2:1' },
  tall:      { ratio: 0.5,  cols: 1, rows: 2, label: '1:2' },
} as const

export type AspectPreset = keyof typeof ASPECT_PRESETS

/**
 * Detect the closest aspect ratio preset from dimensions.
 * Works for images, videos, or any content with width/height.
 */
export function snapToPreset(width: number, height: number): AspectPreset {
  if (!width || !height) return 'square'

  const ratio = width / height
  let closest: AspectPreset = 'square'
  let minDiff = Infinity

  for (const [key, preset] of Object.entries(ASPECT_PRESETS)) {
    const diff = Math.abs(ratio - preset.ratio)
    if (diff < minDiff) {
      minDiff = diff
      closest = key as AspectPreset
    }
  }

  return closest
}

/**
 * Get CSS grid span classes for a preset.
 * Grid uses: grid-template-columns: repeat(4, 1fr)
 */
export function getPresetGridSpan(preset: AspectPreset): { colSpan: number; rowSpan: number } {
  const p = ASPECT_PRESETS[preset]
  return { colSpan: p.cols, rowSpan: p.rows }
}
