// ═══════════════════════════════════════════
// LAYOUT ENGINE
// Single grid mode — clean, rounded, uniform
// ═══════════════════════════════════════════

export type LayoutMode = 'grid'

export interface TileLayer {
  type: 'mainContent' | 'overlay' | 'background'
  content?: any
}

export interface LayoutTile {
  id: string
  type: string
  url?: string
  aspect?: string | null
  size?: number
  layers: TileLayer[]
  [key: string]: any
}

// ═══════════════════════════════════════════
// DETERMINISTIC SHUFFLE
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
// LAYOUT CONFIG
// ═══════════════════════════════════════════

export interface LayoutConfig {
  gap: number
  tileRadius: number
  tileShadow: string
  containerPadding: number
}

export function getLayoutConfig(_mode: LayoutMode): LayoutConfig {
  return {
    gap: 3,
    tileRadius: 12,
    tileShadow: 'none',
    containerPadding: 0,
  }
}

/**
 * Ensure every tile has a layers[] array.
 * Default: [{ type: 'mainContent' }] — the tile itself is the first layer.
 */
export function normalizeTileLayers<T extends Record<string, any>>(tile: T): T & { layers: TileLayer[] } {
  if (tile.layers && Array.isArray(tile.layers) && tile.layers.length > 0) {
    return tile as T & { layers: TileLayer[] }
  }
  return { ...tile, layers: [{ type: 'mainContent' }] }
}
