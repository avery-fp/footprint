# Spec: Auth cleanup pass

**Date:** 2026-04-06
**Owner:** PR #3 of the auth-loop fix series
**Status:** Approved
**Depends on:** PR #1 (`bab1c72`) + PR #2 (`b516c13`)

## Problem

PR #1 killed the loop with the smallest possible blast radius (3 files). PR #2 unified the modal. But the codebase still contains 11+ stale references to `/login`, `/auth/login`, and `/signup` — each one routes through the redirect stub from PR #1, which works, but:

1. Adds an extra HTTP hop on every sign-in path
2. Quietly resurrects the loop pattern if anyone deletes the redirect stubs in the future
3. Hides the canonical entry behind layers of indirection
4. Drifts over time — new dead refs get added before someone notices

There's also a **latent Stripe success_url bug** at `app/api/publish/route.ts:416`: when `return_to` is missing, the success_url falls back to `/claim?session_id=...`, which is now a redirect stub that drops query params. The Stripe finalize never fires for that code path.

And `middleware.ts` `publicRoutes` lists six dead routes that the `isPublicProfile` regex already covers (`/login`, `/auth/login`, `/signin`, `/signup`, `/welcome`, `/claim`), plus the comment on line 12 still says "missing → redirect to /auth/login" even though the code redirects to `/ae?claim=1`.

## Goal

Zero hardcoded `/login`, `/auth/login`, `/signin`, or `/signup` URLs in source code. All sign-in paths route through `AUTH_ENTRY` from `lib/routes.ts`. Stripe success_url fallback uses a route that won't drop query params. Middleware `publicRoutes` lists only what `isPublicProfile` and `isApiRoute` don't already cover. The redirect stubs (`app/login/page.tsx`, `app/auth/login/page.tsx`, `app/signin/page.tsx`, `app/signup/page.tsx`, `app/welcome/page.tsx`, `app/claim/page.tsx`) stay in place as bookmark catchers.

## Scope

### In scope (PR #3)

- Replace every hardcoded sign-in URL in source code with `AUTH_ENTRY` (or a slug-aware variant) from `lib/routes.ts`
- Fix the Stripe `success_url` and `cancel_url` fallback in `app/api/publish/route.ts:414-417`
- Trim `middleware.ts` `publicRoutes` to only what `isPublicProfile` / `isApiRoute` don't already cover
- Fix the stale comment in `middleware.ts:12`
- Preserve attribution params on `app/preview/PreviewClient.tsx:145` (the `?ref=preview&name=...` query)
- Fix the welcome email URL in `lib/auth.ts:131`
- Add a small `withParams` helper to `lib/routes.ts` for URLs that need to carry query data
- Vitest unit tests for the new helper

### Out of scope

- Deleting `app/api/auth/login/route.ts` (the unused password+bcrypt endpoint). Leaving it for a future cleanup commit — not in this series.
- The PublicPage → SovereignTile prop refactor for `session_id` (the Plan agent's URL parsing race). The Stripe finalize flow has a deeper bug here, but it's in pre-monetization (silent path takes precedence per recent commits) so not currently exercised. Track separately.
- Deleting the redirect stubs (`app/login/page.tsx` etc.) — they catch external bookmarks and welcome emails sent before the cutover.
- Touching `e2e/auth-loop.spec.ts` (intentionally references `/login` to test the redirect)
- `scripts/set-password.mjs` log message ("Sign in at: /auth/login") — admin script, ship in a different cleanup
- Visual or behavioral changes to any UI

## Files in scope

| File | Line(s) | Current | Target |
|---|---|---|---|
| `lib/routes.ts` | — | (existing) | Add `withParams(base, params)` helper |
| `app/[slug]/home/page.tsx` | 898 | `router.push('/auth/login?redirect=...')` | `router.push(AUTH_ENTRY)` |
| `app/[slug]/home/page.tsx` | 1792 | `window.location.href = '/login'` | `window.location.href = '/${slug}'` (post-signout = drop on public profile) |
| `app/aro-dashboard/page.tsx` | 34, 39 | `redirect('/login')` | `redirect(AUTH_ENTRY)` |
| `app/aro/page.tsx` | 220 | `href="/login"` | `href={AUTH_ENTRY}` |
| `app/aro/reactor/page.tsx` | 100 | `<a href="/login">` | `<a href={AUTH_ENTRY}>` |
| `app/page.tsx` | 82 | `href="/login"` | `href={AUTH_ENTRY}` |
| `app/MakeYoursCTA.tsx` | 19 | `<Link href="/signup">` | `<Link href={AUTH_ENTRY}>` |
| `app/preview/PreviewClient.tsx` | 145 | `/signup?ref=preview&name=...` | `withParams(AUTH_ENTRY, { ref: 'preview', name, city })` |
| `lib/auth.ts` | 131 | `${baseUrl}/login` (welcome email CTA) | `${baseUrl}${AUTH_ENTRY}` |
| `app/api/publish/route.ts` | 416 | `${baseUrl}/claim?session_id=...&username=...` (fallback) | `${baseUrl}/ae?claim=1&session_id=...&username=...` |
| `app/api/publish/route.ts` | 417 | `${baseUrl}/claim` (cancel fallback) | `${baseUrl}/ae` |
| `middleware.ts` | 12 | comment says "/auth/login" | "/ae?claim=1" |
| `middleware.ts` | 17-34 | publicRoutes lists 6 dead single-segment paths | Drop `/login`, `/auth/login`, `/signin`, `/signup`, `/welcome`, `/claim`, `/api/`. Keep `/`, `/auth`, `/build`, `/checkout`, `/success`, `/deed`, `/gift`, `/public`. |
| `app/signin/page.tsx` | 4 | `redirect('/login')` | `redirect(AUTH_ENTRY)` (saves one hop) |
| `tests/routes.test.ts` | — | (existing) | Add tests for `withParams` |

## Acceptance criteria

1. `grep -nE "['\"\`](/login\|/auth/login\|/signin\|/signup)['\"\`]" app/ lib/ components/` returns no matches outside `lib/routes.ts`, `app/{login,auth/login,signin,signup,welcome,claim}/page.tsx` (the redirect stubs themselves), and `e2e/auth-loop.spec.ts`
2. Stripe success_url fallback no longer routes through `/claim` (use `/ae?claim=1` so the SovereignTile can handle finalize when reachable)
3. `middleware.ts` `publicRoutes` is shorter and only contains entries the regex/api checks don't already cover
4. All five PR #1 e2e tests still pass (when playwright is installed)
5. Vitest 119+ tests still pass with new `withParams` tests
6. `tsc --noEmit` clean
7. Live verification: visit `/login`, `/auth/login`, `/signin` — still redirects to `/ae?claim=1`. Visit `/zzz-no-such-page` not-found — CTA still works. Visit `/aro-dashboard` signed out — still redirects.

## Risk

| Risk | Mitigation |
|---|---|
| Removing a publicRoute breaks a real public route | Only remove single-segment paths that `isPublicProfile` already catches. Verify with live nav of every removed route after the change. |
| Stripe fallback change breaks the finalize flow | The fallback is dead code currently (silent pre-monetization). Add a comment noting the deeper URL parsing race. |
| `app/[slug]/home/page.tsx:1792` change (sign-out) sends user to a 404 | The sign-out only happens from inside the editor, where the slug definitely exists (the editor wouldn't have loaded otherwise). `/${slug}` is always a valid public profile. |
| `withParams` URL building edge cases (already-present query string, encoding) | Unit tests cover: bare path, path with ?, special chars, undefined values |
