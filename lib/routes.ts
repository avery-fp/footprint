/**
 * Route constants.
 *
 * Auth routes are dead. AUTH_ENTRY now points at the root showcase so any
 * stragglers fall through safely instead of 404ing. The claim flow is:
 *   /  → /ae → "Make yours →" → /{draft-slug}/home → /api/checkout → …
 */

/** Legacy: kept so old imports compile. Points at the root. */
export const AUTH_ENTRY = '/'

export function authEntryFor(_slug?: string | null): string {
  return AUTH_ENTRY
}

/**
 * Append query parameters to a URL, preserving any existing query string.
 */
export function withParams(
  base: string,
  params: Record<string, string | number | null | undefined>
): string {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string | number][]
  if (entries.length === 0) return base
  const sep = base.includes('?') ? '&' : '?'
  const qs = entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
  return `${base}${sep}${qs}`
}
