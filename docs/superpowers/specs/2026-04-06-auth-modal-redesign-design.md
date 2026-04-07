# Spec: Unify and redesign the auth modal

**Date:** 2026-04-06
**Owner:** PR #2 of the auth-loop fix series
**Status:** Approved
**Depends on:** PR #1 (commit `bab1c72`) — the loop hotfix

## Problem

Two parallel auth UIs exist in the codebase. They will drift.

1. **`components/SovereignTile.tsx`** (lines 214-264) — used by `app/[slug]/PublicPage.tsx` when a visitor lands on `/{slug}?claim=1`. Renders bare wordless mono buttons "google" and "apple". Inlines its own `handleOAuth` instead of using the existing `OAuthButton` component.

2. **`app/[slug]/home/page.tsx`** (lines 1717-1740) — used by the editor's 401/claim overlay when an unauthenticated user hits `/{slug}/home`. Renders a bordered icon-prefixed modal using `<OAuthButton provider="google" />` and `<OAuthButton provider="apple" />`.

The user wants the SovereignTile UI replaced with the bordered icon-button modal style (matching a screenshot they shared) and a new "passkey" option added. Since the editor already uses bordered buttons, this is also a unification opportunity.

## What the user wants

Single modal with:
- Bordered, full-width icon-prefixed buttons (Google, Apple, Passkey)
- A small "or" divider
- An email input + Continue button (magic link via `/api/auth/magic-link`)
- An optional X close button (top right)
- Footprint's wordless monospace aesthetic — no title, no subtitle
- Optional `$10` price line (gated by seed-phase, mirrors current SovereignTile)

User decisions from the planning conversation:
- **Passkey**, not phone — wire up the existing `app/api/auth/passkey/*` routes (fully built, currently unused from the client)
- **Wordless** — no title, no subtitle, just buttons
- **Phased shipping** — ships as PR #2 after the PR #1 hotfix (already merged as `bab1c72`)

## Goal

Extract one `<AuthModal>` component used by both `SovereignTile` and `app/[slug]/home/page.tsx`. Same component, same behavior, same future bug surface. Adds passkey as a third sign-in option using the existing backend.

## Scope (PR #2)

### In scope
- New `components/auth/AuthModal.tsx` consuming the existing `OAuthButton`
- New `components/auth/PasskeyButton.tsx` (extracted, mirrors `OAuthButton` visual treatment)
- Wire `@simplewebauthn/browser` `startAuthentication` against the existing `/api/auth/passkey/authenticate` endpoint
- Replace the inline auth block in `SovereignTile.tsx` (phase === 'auth') with `<AuthModal />`
- Replace the inline auth block in `app/[slug]/home/page.tsx` (the `claimOverlay === 'auth'` branch) with `<AuthModal />`
- Email input + Continue → POST `/api/auth/magic-link` → "check your email" success state
- "or" divider between social buttons and email row
- Vitest unit tests for any new logic
- Live verification via Preview MCP

### Out of scope
- Creating a new `/api/auth/passkey/login` route — the existing `/authenticate` route already issues a session, no wrapper needed
- Touching the Stripe finalize flow, the username phase, or the ceremony phase in SovereignTile
- Cleaning up the 11 stale `/login` references — that's PR #3
- Visual changes beyond what's needed to match the bordered-button modal layout
- Adding a title or subtitle (user explicitly chose wordless)
- Phone auth (user picked passkey instead)
- Adding new Supabase tables or migrations

## Acceptance criteria

1. `/ae?claim=1` (signed out) renders the AuthModal with: Google button, Apple button (only if `NEXT_PUBLIC_APPLE_ENABLED=true`), Passkey button, "or" divider, email input + Continue button, optional `$10` price line
2. `/{slug}/home` (signed out) renders the same AuthModal component (same DOM structure)
3. Clicking Google triggers OAuth flow (existing `OAuthButton` behavior, untouched)
4. Clicking Passkey triggers `navigator.credentials.get` via `@simplewebauthn/browser`, posts the assertion to `/api/auth/passkey/authenticate`, and on success the page reloads (session cookie set)
5. Submitting email triggers POST `/api/auth/magic-link` and shows "check your email" success state
6. The username phase, processing phase, and ceremony phase in `SovereignTile` are unchanged (they're not part of `auth` phase)
7. The editor's `claimOverlay === 'username'` branch in `home/page.tsx` is unchanged
8. All existing tests still pass; vitest typecheck clean
9. Live verification: open `/ae?claim=1` in incognito, see the new modal; open `/{slug}/home` signed out, see the same modal

## Non-goals

- Implementing a `redirectAfterAuth` mechanism for passkey (the page will reload, and the post_auth_redirect cookie is already set by callers)
- Browser feature detection beyond what `@simplewebauthn/browser` provides natively (`browserSupportsWebAuthn`)
- Improving the SovereignTile state machine (the URL parsing race the Plan agent flagged is a PR #3 polish item)

## Risk

| Risk | Mitigation |
|---|---|
| Passkey browser API quirks (Safari iOS, older Chrome) | Use `@simplewebauthn/browser`'s `browserSupportsWebAuthn()` and hide the button if unsupported |
| Breaking the SovereignTile state machine while editing the auth phase | Touch only the inline auth JSX (lines 214-264). Leave `phase`, `setPhase`, init effect, finalize, username flow, ceremony flow alone. |
| Breaking the editor `claimOverlay === 'username'` branch | Touch only the `auth` ternary branch in home/page.tsx. The username branch shares the same parent div but is rendered separately. |
| Drift between the two callsites | Single `<AuthModal />` component is the whole point — both call sites pass props, neither inlines |
| Email magic-link rate limit (3 per 15 min in `/api/auth/magic-link`) | Show the rate-limit error to the user via the existing 429 response |
| Dev environment passkey: rpID is `localhost`, may not work cleanly with the dev DB | Verification proves the modal renders + button is wired; full passkey ceremony test deferred to a real device |

## How verification will work

1. **Vitest**: unit-test any pure helpers in the new components
2. **Preview MCP**: dev server, navigate to `/ae?claim=1` signed out, assert the DOM contains Google + Apple (if flag) + Passkey + email input + Continue
3. **Preview MCP**: navigate to `/{slug}/home` signed out, assert the same DOM structure
4. **Screenshot**: capture both states for visual proof
5. **Type/lint**: `tsc --noEmit` clean
