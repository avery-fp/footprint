// ═══════════════════════════════════════════
// LAYOUT COMPOSITION ENGINE
// Three modes, one tile array, different arrangements
// ═══════════════════════════════════════════

export type LayoutMode = 'editorial' | 'breathe' | 'grid'

export interface LayoutTile {
  id: string
  type: string
  url?: string
  aspect?: string | null
  size?: number
  [key: string]: any
}

// ═══════════════════════════════════════════
// EDITORIAL COMPOSITION
// hero → pair → breath → trio → pair → hero → repeat
// Never two identical row types consecutively
// ═══════════════════════════════════════════

export type RowType = 'hero' | 'pair' | 'breath' | 'trio'

export interface ComposedRow {
  type: RowType
  tiles: LayoutTile[]
}

const EDITORIAL_PATTERN: RowType[] = ['hero', 'pair', 'breath', 'trio', 'pair', 'hero']

/**
 * Compose tiles into editorial rows following the pattern.
 * Consumes tiles in order; if not enough remain for a row type, adapts.
 */
export function composeEditorial(tiles: LayoutTile[]): ComposedRow[] {
  if (tiles.length === 0) return []

  const rows: ComposedRow[] = []
  let cursor = 0
  let patternIndex = 0

  while (cursor < tiles.length) {
    const remaining = tiles.length - cursor
    const rowType = EDITORIAL_PATTERN[patternIndex % EDITORIAL_PATTERN.length]

    switch (rowType) {
      case 'hero': {
        rows.push({ type: 'hero', tiles: [tiles[cursor]] })
        cursor += 1
        break
      }
      case 'pair': {
        if (remaining >= 2) {
          rows.push({ type: 'pair', tiles: [tiles[cursor], tiles[cursor + 1]] })
          cursor += 2
        } else {
          rows.push({ type: 'hero', tiles: [tiles[cursor]] })
          cursor += 1
        }
        break
      }
      case 'breath': {
        // Breath = single tile with space, similar to hero but narrower
        rows.push({ type: 'breath', tiles: [tiles[cursor]] })
        cursor += 1
        break
      }
      case 'trio': {
        if (remaining >= 3) {
          rows.push({ type: 'trio', tiles: [tiles[cursor], tiles[cursor + 1], tiles[cursor + 2]] })
          cursor += 3
        } else if (remaining >= 2) {
          rows.push({ type: 'pair', tiles: [tiles[cursor], tiles[cursor + 1]] })
          cursor += 2
        } else {
          rows.push({ type: 'hero', tiles: [tiles[cursor]] })
          cursor += 1
        }
        break
      }
    }

    patternIndex++
  }

  return rows
}

// ═══════════════════════════════════════════
// DETERMINISTIC SHUFFLE (for Grid mode)
// Same serial → same shuffle every time
// ═══════════════════════════════════════════

/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Returns a function that produces deterministic values in [0, 1).
 */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates shuffle with deterministic seed.
 * Same serial + same tiles = same order every time.
 */
export function shuffleForGrid<T>(tiles: T[], serial: number): T[] {
  const shuffled = [...tiles]
  const random = mulberry32(serial)

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

// ═══════════════════════════════════════════
// LAYOUT STYLE CONFIGS
// ═══════════════════════════════════════════

export interface LayoutConfig {
  gap: number
  tileRadius: number
  tileShadow: string
  containerPadding: number
}

export function getLayoutConfig(mode: LayoutMode): LayoutConfig {
  switch (mode) {
    case 'breathe':
      return {
        gap: 14,
        tileRadius: 8,
        tileShadow: '0 2px 16px rgba(0,0,0,0.12)',
        containerPadding: 20,
      }
    case 'grid':
      return {
        gap: 2,
        tileRadius: 0,
        tileShadow: 'none',
        containerPadding: 0,
      }
    case 'editorial':
    default:
      return {
        gap: 2,
        tileRadius: 0,
        tileShadow: 'none',
        containerPadding: 0,
      }
  }
}

// ═══════════════════════════════════════════
// ROW STYLE HELPERS (for Editorial/Breathe)
// ═══════════════════════════════════════════

/**
 * Get CSS grid template for a composed row.
 * Used by Editorial and Breathe modes.
 */
export function getRowGridStyle(row: ComposedRow): React.CSSProperties {
  switch (row.type) {
    case 'hero':
      return {
        display: 'grid',
        gridTemplateColumns: '1fr',
      }
    case 'pair':
      return {
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
      }
    case 'breath':
      return {
        display: 'grid',
        gridTemplateColumns: '1fr',
        maxWidth: '75%',
        margin: '0 auto',
      }
    case 'trio':
      return {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
      }
    default:
      return {
        display: 'grid',
        gridTemplateColumns: '1fr',
      }
  }
}

/**
 * Get the aspect ratio for a tile within a composed row.
 */
export function getRowTileAspect(rowType: RowType): string {
  switch (rowType) {
    case 'hero':
      return '16 / 9'
    case 'pair':
      return '4 / 5'
    case 'breath':
      return '3 / 2'
    case 'trio':
      return '1 / 1'
    default:
      return '1 / 1'
  }
}
