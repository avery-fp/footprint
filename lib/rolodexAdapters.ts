// ═══════════════════════════════════════════
// Rolodex persistence adapters
// ═══════════════════════════════════════════

export interface RolodexAdapter {
  load(): Promise<string[]>
  save(slugs: string[]): Promise<void>
}

// ── localStorage adapter (fully implemented) ──

const STORAGE_KEY = 'fp:rolodex'

export const localStorageAdapter: RolodexAdapter = {
  async load(): Promise<string[]> {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },

  async save(slugs: string[]): Promise<void> {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs))
    } catch {
      // Storage full or unavailable — fail silently
    }
  },
}

// ── Remote adapter stub (for authenticated users) ──
// TODO: Implement when backend Rolodex table is ready.
// Must hit: POST /api/rolodex { action: 'add' | 'remove', slug: string }
//           GET  /api/rolodex → string[]

export const remoteAdapter: RolodexAdapter = {
  async load(): Promise<string[]> {
    throw new Error('Remote adapter not implemented')
  },

  async save(_slugs: string[]): Promise<void> {
    throw new Error('Remote adapter not implemented')
  },
}
