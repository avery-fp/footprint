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
