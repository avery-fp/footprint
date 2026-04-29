// ═══════════════════════════════════════════
// Rolodex store — Zustand
// Manages the list of saved footprint slugs.
// ═══════════════════════════════════════════

import { create } from 'zustand'
import { localStorageAdapter, type RolodexAdapter } from '@/lib/rolodexAdapters'

const ORIGIN_SLUG = 'ae'

function withOrigin(slugs: string[]): string[] {
  const seen = new Set<string>()
  const result = [ORIGIN_SLUG]
  seen.add(ORIGIN_SLUG)

  for (const slug of slugs) {
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    result.push(slug)
  }

  return result
}

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
      const loadedSlugs = await get().adapter.load()
      const slugs = withOrigin(loadedSlugs)
      set({ slugs, loaded: true })
      if (slugs.length !== loadedSlugs.length || slugs[0] !== ORIGIN_SLUG) {
        await get().adapter.save(slugs)
      }
    } catch {
      set({ slugs: withOrigin([]), loaded: true })
    }
  },

  has(slug: string) {
    return get().slugs.includes(slug)
  },

  async add(slug: string) {
    const prev = withOrigin(get().slugs)
    if (prev.includes(slug)) return

    // Optimistic update
    const next = withOrigin([...prev, slug])
    set({ slugs: next })

    try {
      await get().adapter.save(next)
    } catch {
      // Rollback on failure
      set({ slugs: prev })
    }
  },

  async remove(slug: string) {
    const prev = withOrigin(get().slugs)
    if (!prev.includes(slug)) return

    // Optimistic update
    const next = withOrigin(prev.filter(s => s !== slug))
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
