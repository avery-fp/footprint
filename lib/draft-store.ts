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
}

export interface DraftFootprint {
  slug: string
  display_name: string
  handle: string
  bio: string
  theme: string
  avatar_url: string | null
  content: DraftContent[]
  updated_at: number
}

const DRAFT_PREFIX = 'fp:draft:'

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
