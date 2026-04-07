# Plan: Auth cleanup pass (PR #3)

**Date:** 2026-04-06
**Spec:** [`docs/superpowers/specs/2026-04-06-auth-cleanup-design.md`](../specs/2026-04-06-auth-cleanup-design.md)
**Status:** In progress
**Depends on:** `bab1c72` (PR #1) + `b516c13` (PR #2)

## TDD execution order

### Task 1: Failing tests for `withParams` helper

**File:** `tests/routes.test.ts` (extend the existing file)

Tests:
1. `withParams('/foo', {})` returns `/foo` unchanged
2. `withParams('/foo', { a: '1' })` returns `/foo?a=1`
3. `withParams('/foo?b=2', { a: '1' })` returns `/foo?b=2&a=1` (preserves existing query, joins with `&`)
4. `withParams('/foo', { a: 'hello world' })` returns `/foo?a=hello+world` (URL encoding)
5. `withParams('/foo', { a: '1', b: undefined, c: '3' })` returns `/foo?a=1&c=3` (skips undefined)
6. `withParams('/ae?claim=1', { ref: 'preview', name: 'João' })` returns `/ae?claim=1&ref=preview&name=Jo%C3%A3o`

### Task 2: Implement `withParams` in `lib/routes.ts`

```ts
/**
 * Append query parameters to a URL, preserving any existing query string.
 * Skips entries whose value is null or undefined.
 */
export function withParams(base: string, params: Record<string, string | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  if (entries.length === 0) return base
  const sep = base.includes('?') ? '&' : '?'
  const qs = entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${base}${sep}${qs}`
}
```

### Task 3: Rewrite the literals (parallel)

Each call site replaces a hardcoded string with `AUTH_ENTRY` (or `withParams(AUTH_ENTRY, ...)` for preview).

| File | Change |
|---|---|
| `app/[slug]/home/page.tsx:898` | `router.push(AUTH_ENTRY)` + import |
| `app/[slug]/home/page.tsx:1792` | `window.location.href = '/${slug}'` (drop on public profile) |
| `app/aro-dashboard/page.tsx:34, 39` | `redirect(AUTH_ENTRY)` + import |
| `app/aro/page.tsx:220` | `href={AUTH_ENTRY}` + import |
| `app/aro/reactor/page.tsx:100` | `href={AUTH_ENTRY}` + import |
| `app/page.tsx:82` | `href={AUTH_ENTRY}` + import |
| `app/MakeYoursCTA.tsx:19` | `href={AUTH_ENTRY}` + import |
| `app/preview/PreviewClient.tsx:145` | `withParams(AUTH_ENTRY, { ref: 'preview', name, city })` + import |
| `lib/auth.ts:131` | `${baseUrl}${AUTH_ENTRY}` (welcome email CTA) + import |
| `app/signin/page.tsx:4` | `redirect(AUTH_ENTRY)` (saves one hop) + import |

### Task 4: Stripe success_url + cancel_url

`app/api/publish/route.ts:414-417`:

```ts
success_url: return_to
  ? `${baseUrl}${return_to}${return_to.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}&username=${encodeURIComponent(cleanUsername)}`
  : `${baseUrl}/ae?claim=1&session_id={CHECKOUT_SESSION_ID}&username=${encodeURIComponent(cleanUsername)}`,
cancel_url: return_to ? `${baseUrl}${return_to}` : `${baseUrl}/ae`,
```

Add a comment noting that the `/ae?claim=1` fallback is correct but the SovereignTile/PublicPage URL parsing race needs a separate fix to fully wire finalize when this fallback fires.

### Task 5: Middleware cleanup

`middleware.ts`:

- Fix line 12 comment: `redirect to /auth/login` → `redirect to /ae?claim=1`
- Trim `publicRoutes`:

```ts
const publicRoutes = [
  '/',
  '/auth',     // covers /auth/login (redirect stub) and /auth/callback
  '/build',
  '/checkout',
  '/success',
  '/deed',     // covers /deed/[serial]
  '/gift',     // covers /gift/claim
  '/public',
]
```

Drop: `/auth/login`, `/signup`, `/signin`, `/login`, `/welcome`, `/claim`, `/api/`. The single-segment ones are caught by `isPublicProfile` regex. `/api/` is caught by `isApiRoute`. `/auth/login` is caught by the `/auth` prefix.

### Task 6: Verification

1. Vitest:
   - Extended `tests/routes.test.ts` for `withParams` (6 new tests)
   - Full suite: 125+ pass
2. Typecheck: `tsc --noEmit` clean
3. Grep: `grep -rE "['\"]/login['\"]|['\"]/signin['\"]|['\"]/signup['\"]|['\"]/auth/login['\"]" app/ lib/ components/ middleware.ts` returns only:
   - `lib/routes.ts` (the documentation comment)
   - The redirect stub files themselves (`app/{login,signup,signin,welcome,claim,auth/login}/page.tsx`)
   - `e2e/auth-loop.spec.ts` (intentional regression coverage)
4. Preview MCP live verification:
   - `/login` still redirects to `/ae?claim=1`
   - `/auth/login` still redirects
   - `/signin` still redirects
   - `/aro-dashboard` (signed out) redirects to `/ae?claim=1`
   - `/zzz-no-such-page` not-found CTA points at `/ae?claim=1`
5. Sanity grep on the new `withParams` callsites — should resolve, no typos

## Files touched

| File | Action |
|---|---|
| `lib/routes.ts` | MODIFY (add `withParams`) |
| `tests/routes.test.ts` | MODIFY (add 6 tests) |
| `app/[slug]/home/page.tsx` | MODIFY (2 sites) |
| `app/aro-dashboard/page.tsx` | MODIFY (2 sites) |
| `app/aro/page.tsx` | MODIFY (1 site) |
| `app/aro/reactor/page.tsx` | MODIFY (1 site) |
| `app/page.tsx` | MODIFY (1 site) |
| `app/MakeYoursCTA.tsx` | MODIFY (1 site) |
| `app/preview/PreviewClient.tsx` | MODIFY (1 site) |
| `app/signin/page.tsx` | MODIFY (1 site) |
| `lib/auth.ts` | MODIFY (1 site) |
| `app/api/publish/route.ts` | MODIFY (success_url + cancel_url fallback) |
| `middleware.ts` | MODIFY (publicRoutes + comment) |
| `docs/superpowers/specs/2026-04-06-auth-cleanup-design.md` | CREATE |
| `docs/superpowers/plans/2026-04-06-auth-cleanup-plan.md` | CREATE |

Total: 13 modified, 2 new docs.
