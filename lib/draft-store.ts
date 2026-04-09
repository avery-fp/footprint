/**
 * Draft Store
 *
 * Persists footprint drafts to localStorage by slug.
 * Key format: fp:draft:{slug}
 * No expiration - drafts persist until user publishes or clears.
 */

export interface DraftContent {
  id: string
  url: string
  type: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  embed_html: string | null
  position: number
  room_id?: string | null
  size?: number
  aspect?: string | null
}

export interface DraftFootprint {
  slug: string
  display_title?: string
  display_name: string
  handle: string
  bio: string
  theme: string
  grid_mode?: 'grid'
  avatar_url: string | null
  content: DraftContent[]
  updated_at: number
}

const DRAFT_PREFIX = 'fp:draft:'
const DRAFT_DB_NAME = 'fp-drafts'
const DRAFT_DB_VERSION = 1
const DRAFT_STORE_NAME = 'drafts'
const LOCALSTORAGE_SAFE_CHARS = 400_000

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openDraftDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function loadDraftFromIndexedDb(slug: string): Promise<DraftFootprint | null> {
  const db = await openDraftDb()
  if (!db) return null

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, 'readonly')
    const store = tx.objectStore(DRAFT_STORE_NAME)
    const request = store.get(getDraftKey(slug))

    request.onsuccess = () => resolve((request.result as DraftFootprint | undefined) || null)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

async function saveDraftToIndexedDb(slug: string, draft: DraftFootprint): Promise<void> {
  const db = await openDraftDb()
  if (!db) return

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite')
    const store = tx.objectStore(DRAFT_STORE_NAME)
    store.put(draft, getDraftKey(slug))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function clearDraftFromIndexedDb(slug: string): Promise<void> {
  const db = await openDraftDb()
  if (!db) return

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite')
    const store = tx.objectStore(DRAFT_STORE_NAME)
    store.delete(getDraftKey(slug))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function getDraftKey(slug: string): string {
  return `${DRAFT_PREFIX}${slug}`
}

export function loadDraft(slug: string): DraftFootprint | null {
  if (typeof window === 'undefined') return null

  try {
    const key = getDraftKey(slug)
    const data = localStorage.getItem(key)
    if (!data) return null
    return JSON.parse(data) as DraftFootprint
  } catch {
    return null
  }
}

export function saveDraft(slug: string, draft: DraftFootprint): void {
  if (typeof window === 'undefined') return

  try {
    const key = getDraftKey(slug)
    const data = JSON.stringify({
      ...draft,
      updated_at: Date.now(),
    })
    localStorage.setItem(key, data)
  } catch (e) {
    console.error('Failed to save draft:', e)
  }
}

export async function loadDraftAsync(slug: string): Promise<DraftFootprint | null> {
  const localDraft = loadDraft(slug)

  try {
    const indexedDraft = await loadDraftFromIndexedDb(slug)
    if (!indexedDraft) return localDraft
    if (!localDraft) return indexedDraft
    return (indexedDraft.updated_at || 0) > (localDraft.updated_at || 0) ? indexedDraft : localDraft
  } catch {
    return localDraft
  }
}

export async function saveDraftAsync(slug: string, draft: DraftFootprint): Promise<void> {
  if (typeof window === 'undefined') return

  const normalizedDraft = {
    ...draft,
    updated_at: Date.now(),
  }

  const serialized = JSON.stringify(normalizedDraft)

  if (serialized.length <= LOCALSTORAGE_SAFE_CHARS) {
    try {
      localStorage.setItem(getDraftKey(slug), serialized)
    } catch (e) {
      console.error('Failed to save draft to localStorage:', e)
    }
  } else {
    try {
      localStorage.removeItem(getDraftKey(slug))
    } catch {
      // ignore
    }
  }

  try {
    await saveDraftToIndexedDb(slug, normalizedDraft)
  } catch (e) {
    console.error('Failed to save draft to IndexedDB:', e)
  }
}

export async function clearDraftAsync(slug: string): Promise<void> {
  clearDraft(slug)

  try {
    await clearDraftFromIndexedDb(slug)
  } catch {
    // ignore
  }
}

export function clearDraft(slug: string): void {
  if (typeof window === 'undefined') return

  try {
    const key = getDraftKey(slug)
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function hasDraft(slug: string): boolean {
  return loadDraft(slug) !== null
}
