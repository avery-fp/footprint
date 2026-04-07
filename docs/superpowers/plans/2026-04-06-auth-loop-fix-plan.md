# Plan: Kill the sign-in loop (PR #1)

**Date:** 2026-04-06
**Spec:** [`docs/superpowers/specs/2026-04-06-auth-loop-fix-design.md`](../specs/2026-04-06-auth-loop-fix-design.md)
**Status:** In progress

## TDD execution order

Strict red → green → refactor. Each test fails before the file that makes it pass exists.

### Task 1: Write failing e2e tests

**File:** `e2e/auth-loop.spec.ts` (NEW)

Five tests, all expected to fail against current `main`:

1. `direct visit to /login redirects to /ae?claim=1` — expects URL `/ae` after navigation, status 200. Currently 404s.
2. `direct visit to /auth/login redirects to /ae?claim=1` — same. Currently 404s.
3. `direct visit to /signin reaches /ae in at most 2 hops` — Currently lands on a 404.
4. `unclaimed slug not-found CTA points to /ae?claim=1, never /login` — visits `/zzz-no-such-slug-9999`, finds the "claim this page" anchor, asserts its `href` does NOT contain `/login`. Currently fails because `app/not-found.tsx:91` always emits `/login`.
5. `unclaimed slug not-found page never references /login in DOM` — `page.content()` does not include `/login`. Defense in depth against future regressions.

**Verify:** `npm run test:e2e -- auth-loop` — all 5 fail with current code.

### Task 2: Add the auth-entry helper

**File:** `lib/routes.ts` (NEW)

```ts
/** The one true unauthenticated entry point. */
export const AUTH_ENTRY = '/ae?claim=1'

/** Build a slug-aware claim entry that returns the user to a specific page. */
export function authEntryFor(slug?: string | null): string {
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return AUTH_ENTRY
  return `/${slug}?claim=1`
}
```

Slug validation prevents path injection from any caller passing user input.

### Task 3: Static redirect for /login

**File:** `app/login/page.tsx` (NEW)

```tsx
import { redirect } from 'next/navigation'
import { AUTH_ENTRY } from '@/lib/routes'

export default function LoginPage() {
  redirect(AUTH_ENTRY)
}
```

**Verify:** Tests 1 and (transitively) 3 now pass.

### Task 4: Static redirect for /auth/login

**File:** `app/auth/login/page.tsx` (NEW)

```tsx
import { redirect } from 'next/navigation'
import { AUTH_ENTRY } from '@/lib/routes'

export default function AuthLoginPage() {
  redirect(AUTH_ENTRY)
}
```

**Verify:** Test 2 passes.

### Task 5: Fix the HttpOnly bug in not-found.tsx

**File:** `app/not-found.tsx` (MODIFY lines 88-91)

Current:
```ts
const hasSession = typeof document !== 'undefined' && document.cookie.includes('fp_session')
const claimHref = hasSession
  ? `/claim?username=${displaySlug}`
  : `/login?redirect=${encodeURIComponent(`/claim?username=${displaySlug}`)}`
```

Replace with:
```ts
const claimHref = AUTH_ENTRY
```

Also remove the now-dead `hasSession` line and add the import:
```ts
import { AUTH_ENTRY } from '@/lib/routes'
```

**Note:** The original plan said `authEntryFor(displaySlug)`, which is wrong. `displaySlug` is unclaimed by definition (we're inside not-found.tsx), so `/{displaySlug}?claim=1` would route right back to this same component → new loop. Use `AUTH_ENTRY` instead. Pre-filling the desired username inside SovereignTile is a PR #2 polish item.

**Verify:** Tests 4 and 5 pass.

## Verification checklist

- [ ] All 5 new e2e tests pass: `npm run test:e2e -- auth-loop`
- [ ] All existing e2e tests still pass: `npm run test:e2e`
- [ ] Vitest unit tests still pass: `npm run test`
- [ ] Typecheck clean: `npm run typecheck`
- [ ] Lint clean: `npm run lint`
- [ ] Manual smoke (dev server):
  - Visit `/login` in incognito → exactly one 30x → `/ae` → page renders, no 404
  - Visit `/auth/login` → same
  - Visit `/signin` → ≤ 2 hops → `/ae` → page renders
  - Visit `/zzz-no-such-page-9999` → not-found page renders → click "claim this page" → lands on `/zzz-no-such-page-9999?claim=1`, never on `/login`
  - DevTools network tab: zero 404s for any of the above

## Files touched

| File | Action | LOC |
|---|---|---|
| `e2e/auth-loop.spec.ts` | CREATE | ~50 |
| `lib/routes.ts` | CREATE | ~10 |
| `app/login/page.tsx` | CREATE | 5 |
| `app/auth/login/page.tsx` | CREATE | 5 |
| `app/not-found.tsx` | MODIFY | -3 / +2 |

Total: 4 new files, 1 modified, ~75 LOC.

## Out of scope (deferred to PR #2 / PR #3)

- The 11 dead `/login` and `/signup` references in editor / aro / preview / homepage / welcome email
- `middleware.ts` `publicRoutes` cleanup
- Stripe success_url session_id drop
- Modal redesign
- Unifying `SovereignTile` and home page auth overlays
