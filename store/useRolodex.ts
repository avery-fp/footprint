// ═══════════════════════════════════════════
// Rolodex store — Zustand
// Manages the list of saved footprint slugs.
// ═══════════════════════════════════════════

import { create } from 'zustand'
import { localStorageAdapter, type RolodexAdapter } from '@/lib/rolodexAdapters'

interface RolodexState {
  slugs: string[]
  loaded: boolean
  adapter: RolodexAdapter

  // Actions
  hydrate: () => Promise<void>
  has: (slug: string) => boolean
  add: (slug: string) => Promise<void>
  remove: (slug: string) => Promise<void>
  setAdapter: (adapter: RolodexAdapter) => void
}

export const useRolodex = create<RolodexState>((set, get) => ({
  slugs: [],
  loaded: false,
  adapter: localStorageAdapter,

  async hydrate() {
    if (get().loaded) return
    try {
      const slugs = await get().adapter.load()
      set({ slugs, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  has(slug: string) {
    return get().slugs.includes(slug)
  },

  async add(slug: string) {
    const prev = get().slugs
    if (prev.includes(slug)) return

    // Optimistic update
    const next = [...prev, slug]
    set({ slugs: next })

    try {
      await get().adapter.save(next)
    } catch {
      // Rollback on failure
      set({ slugs: prev })
    }
  },

  async remove(slug: string) {
    const prev = get().slugs
    if (!prev.includes(slug)) return

    // Optimistic update
    const next = prev.filter(s => s !== slug)
    set({ slugs: next })

    try {
      await get().adapter.save(next)
    } catch {
      // Rollback on failure
      set({ slugs: prev })
    }
  },

  setAdapter(adapter: RolodexAdapter) {
    set({ adapter, loaded: false })
  },
}))
