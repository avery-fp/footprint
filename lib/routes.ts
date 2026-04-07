/**
 * Single source of truth for route constants.
 *
 * Use these helpers anywhere you'd otherwise hardcode '/login', '/signin',
 * '/signup', or '/auth/login'. Those routes are dead. Hardcoding them silently
 * resurrects the sign-in loop.
 */

/** The one true unauthenticated entry point. */
export const AUTH_ENTRY = '/ae?claim=1'

/**
 * Build a slug-aware claim entry that returns the user to a specific page.
 *
 * Returns AUTH_ENTRY if the slug is missing, empty, or contains anything
 * other than [a-zA-Z0-9_-]. The strict regex prevents path traversal and
 * URL injection from any caller passing user input.
 */
export function authEntryFor(slug?: string | null): string {
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return AUTH_ENTRY
  return `/${slug}?claim=1`
}

/**
 * Append query parameters to a URL, preserving any existing query string.
 *
 * Skips entries whose value is null or undefined. Values are URL-encoded.
 *
 * Use this when you need to carry attribution data through the auth flow,
 * e.g. `withParams(AUTH_ENTRY, { ref: 'preview', name, city })`.
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
