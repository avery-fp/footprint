# Spec: Kill the sign-in loop

**Date:** 2026-04-06
**Owner:** PR #1 of the auth-loop fix series
**Status:** Approved

## Problem

Users hit an endless loop trying to sign in. Reproduction:

1. User visits `/login` (or `/auth/login`, or any unclaimed slug then clicks "claim this page")
2. Page 404s (no `app/login/page.tsx` exists — was deleted in commit `7008f8d`)
3. `app/not-found.tsx` renders
4. The not-found CTA href points back to `/login` (because the `hasSession` check is broken — see root cause)
5. User clicks → step 2 → loop

## Root cause

`app/not-found.tsx:88` reads:

```ts
const hasSession = typeof document !== 'undefined' && document.cookie.includes('fp_session')
```

`fp_session` is set with `httpOnly: true` in `lib/auth.ts:28`. **HttpOnly cookies cannot be read from JavaScript by design.** `document.cookie.includes('fp_session')` returns `false` 100% of the time. So the CTA always falls into the `/login` branch, which 404s, which renders this same broken page. That's the loop.

## Secondary issues (non-looping but still wrong)

The "kill /login" refactor (commit `7008f8d`) deleted the pages but left 11+ live references to the dead URLs:

- `app/[slug]/home/page.tsx:898` (network error redirect)
- `app/[slug]/home/page.tsx:1798` (sign-out)
- `app/signin/page.tsx` (server redirect to `/login`)
- `app/aro-dashboard/page.tsx:34, 39`
- `app/aro/page.tsx:220`
- `app/aro/reactor/page.tsx:100`
- `app/page.tsx:82`
- `app/MakeYoursCTA.tsx:19` (`/signup`)
- `app/preview/PreviewClient.tsx:145` (`/signup`)
- `lib/auth.ts:131` (welcome email CTA)

These are landmines but not the loop. They go in PR #3.

## Goal

A signed-out user clicking any "sign in" path lands on `/ae?claim=1` (the canonical auth entry) on the first hop. Zero 404s. Zero loops.

## Strategy

Hotfix the loop with the smallest possible blast radius — three files. Don't touch the 11 dead references; instead, make the dead URLs themselves redirect. The other paths become slow-but-correct (one extra hop) and get cleaned up in PR #3.

## Scope (PR #1)

### In scope
- Stop the loop on `/login`, `/auth/login`, `/signin`, and unclaimed-slug → claim CTA paths
- Add a single source of truth for the auth entry (`lib/routes.ts`)
- Playwright e2e regression coverage so this can't silently come back

### Out of scope
- Modal redesign (PR #2)
- Cleaning up the 11 dead references (PR #3)
- Touching middleware, Stripe success_url, or any of the other secondary issues
- Changing `lib/auth.ts` cookie config (it's correct; the bug is in the consumer)

## Acceptance criteria

1. Direct visit to `/login` returns a single redirect to `/ae?claim=1`, status 200, no second redirect, no 404
2. Direct visit to `/auth/login` returns a single redirect to `/ae?claim=1`
3. Direct visit to `/signin` ends at `/ae?claim=1` in at most 2 hops
4. Visiting an unclaimed slug shows the not-found page with a "claim this page" CTA whose href is `/{slug}?claim=1` or `/ae?claim=1` — never `/login`
5. The not-found page makes zero requests to `/login` or `/auth/login`
6. All five new e2e tests pass; all existing e2e tests still pass

## Non-goals

- Solving every redirect chain in the codebase. That's PR #3.
- Improving the auth UX. That's PR #2.
- Verifying the OAuth callback flow works end-to-end (it appears correct on read, and PR #2 will exercise it for real).

## Risk

| Risk | Mitigation |
|---|---|
| `app/login/page.tsx` doesn't override `app/[slug]/page.tsx` (Next.js routing precedence) | Static segments win over dynamic in Next.js App Router. `RESERVED_SLUGS` in `app/[slug]/page.tsx:20` already lists `'login'`, confirming the existing layout assumes static beats dynamic. Manually verify in dev before merge. |
| Loss of slug context from the not-found page | Accept the loss for now — `authEntryFor(displaySlug)` would route an unclaimed slug back to the same unclaimed slug, creating a NEW loop. Use `AUTH_ENTRY` (`/ae?claim=1`) instead. Pre-filling the desired username inside SovereignTile is a PR #2 polish. |
| Some other code path not yet found | Final test step: visit each documented dead reference and confirm none 404 |
