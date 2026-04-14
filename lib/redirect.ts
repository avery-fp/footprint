/**
 * Single gatekeeper for user-supplied post-auth redirect destinations.
 *
 * The callback route, the OAuth initiation route, and the magic-link route
 * all need to accept a "where should I send you after you sign in" hint
 * from the client. An attacker who can set that hint owns the session
 * handoff, so every path through the auth flow must collapse anything
 * other than a bare same-origin path to null.
 *
 * Accepted: `/`, `/foo`, `/foo/bar`, `/foo?x=1&y=2`.
 * Rejected: `//evil.com`, `https://evil.com`, `\\evil.com`, `javascript:…`,
 *           anything with whitespace / CR / LF, `../…`, non-strings, empty.
 *
 * Returns the input verbatim when valid, otherwise null. Callers fall back
 * to a trusted default (`/home` or `/{user-slug}/home`) when null.
 */
export function sanitizeRedirect(input: unknown): string | null {
  if (typeof input !== 'string') return null
  if (input.length === 0) return null
  // Must start with a single forward slash.
  if (input[0] !== '/') return null
  // Protocol-relative (`//host`) and backslash variants (`/\host`) both
  // resolve to an absolute URL in some browsers/proxies.
  if (input[1] === '/' || input[1] === '\\') return null
  // Reject any whitespace or control character. This blocks CR/LF response
  // splitting and path-traversal tricks that rely on trimming.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(input)) return null
  return input
}
