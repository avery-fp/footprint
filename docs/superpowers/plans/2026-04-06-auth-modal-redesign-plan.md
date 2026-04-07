# Plan: Unify and redesign the auth modal (PR #2)

**Date:** 2026-04-06
**Spec:** [`docs/superpowers/specs/2026-04-06-auth-modal-redesign-design.md`](../specs/2026-04-06-auth-modal-redesign-design.md)
**Status:** In progress
**Depends on:** PR #1 (`bab1c72`) — already committed

## Strategy

Build the new component, swap call sites, verify live. No backend changes — the passkey routes are already fully implemented in `app/api/auth/passkey/authenticate/route.ts`. The OAuth flow is already correct in `components/auth/OAuthButton.tsx`. Email magic-link API is already correct at `app/api/auth/magic-link/route.ts`. **All the missing pieces are in the client UI layer.**

## TDD execution order

### Task 1: Failing test for `PasskeyButton` support detection helper

**File:** `tests/passkey-support.test.ts` (NEW)

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
```

Tests:
1. `isPasskeySupported()` returns false in node environment (no `window`)
2. `isPasskeySupported()` returns true when `window.PublicKeyCredential` exists
3. `isPasskeySupported()` returns false when `window.PublicKeyCredential` is undefined

**Note:** keeping the helper next to the component for now (`components/auth/passkey-support.ts`), exported and unit-testable.

### Task 2: Helper module — `components/auth/passkey-support.ts`

```ts
/**
 * Returns true if the current browser supports WebAuthn / passkeys.
 * Safe to call in SSR — returns false when window is undefined.
 */
export function isPasskeySupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as any).PublicKeyCredential !== 'undefined'
}
```

Tiny on purpose. Heavy lifting is delegated to `@simplewebauthn/browser`.

### Task 3: `components/auth/PasskeyButton.tsx`

Same visual treatment as `OAuthButton` (bordered, full-width, mono uppercase label, fingerprint icon SVG). Uses `@simplewebauthn/browser`'s `startAuthentication`.

```tsx
'use client'
import { useState, useEffect } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { isPasskeySupported } from './passkey-support'

interface PasskeyButtonProps {
  redirectAfterAuth?: string
}

export default function PasskeyButton({ redirectAfterAuth }: PasskeyButtonProps) {
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupported(isPasskeySupported())
  }, [])

  if (!supported) return null

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      // Step 1 — get options
      const optsRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options' }),
      })
      if (!optsRes.ok) throw new Error('Failed to get passkey options')
      const options = await optsRes.json()

      // Step 2 — browser ceremony
      const assertion = await startAuthentication({ optionsJSON: options })

      // Step 3 — verify
      const verifyRes = await fetch('/api/auth/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', response: assertion, challenge: options.challenge }),
      })
      if (!verifyRes.ok) throw new Error('Verification failed')

      // Success — reload (or navigate to redirectAfterAuth)
      window.location.href = redirectAfterAuth || '/ae?claim=1'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey sign-in failed')
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="touch-manipulation"
      style={{ /* same shape as OAuthButton */ }}
    >
      {/* fingerprint SVG icon */}
      <span>{loading ? '...' : 'passkey'}</span>
      {error && <span className="sr-only">{error}</span>}
    </button>
  )
}
```

The styles will mirror `OAuthButton.tsx:51-89` (border, hover, transitions) so the buttons stack visually identically.

### Task 4: `components/auth/EmailRow.tsx` (or inline in AuthModal)

Single bordered row: `<input type="email" />` with a `→` submit button. On submit, POST `/api/auth/magic-link` with `{ email }`. On 200, swap to a "check your email" message. On 429, show the rate-limit message. On other errors, show generic.

Inline inside `AuthModal.tsx` to avoid file sprawl. Pure UI, no separate test needed.

### Task 5: `components/auth/AuthModal.tsx` — the unified modal

```tsx
'use client'
import OAuthButton from './OAuthButton'
import PasskeyButton from './PasskeyButton'
import { useState, useCallback } from 'react'

interface AuthModalProps {
  redirectAfterAuth?: string
  onClose?: () => void
  showPrice?: boolean
}

export default function AuthModal({ redirectAfterAuth, onClose, showPrice }: AuthModalProps) {
  const [email, setEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const handleEmailSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!email.trim() || emailLoading) return
    setEmailLoading(true)
    setEmailError(null)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setEmailSent(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setEmailError(data.error || 'failed to send')
      }
    } catch {
      setEmailError('network error')
    } finally {
      setEmailLoading(false)
    }
  }, [email, emailLoading])

  return (
    <div className="..." style={{ /* dark glass card, same dimensions as current SovereignTile auth phase */ }}>
      {onClose && (
        <button onClick={onClose} className="absolute top-4 right-4 ..." aria-label="close">×</button>
      )}

      <div className="space-y-3 w-full">
        <OAuthButton provider="google" label="google" redirectAfterAuth={redirectAfterAuth} />
        <OAuthButton provider="apple" label="apple" redirectAfterAuth={redirectAfterAuth} />
        <PasskeyButton redirectAfterAuth={redirectAfterAuth} />
      </div>

      {/* OR divider */}
      <div className="flex items-center gap-3 w-full" aria-hidden>
        <div style={{ flex: 1, borderTop: '1px solid rgba(255,255,255,0.18)' }} />
        <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.25em' }}>or</span>
        <div style={{ flex: 1, borderTop: '1px solid rgba(255,255,255,0.18)' }} />
      </div>

      {/* Email row */}
      {emailSent ? (
        <p className="font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>check your email</p>
      ) : (
        <form onSubmit={handleEmailSubmit} className="w-full">
          <div className="flex items-stretch w-full" style={{ border: '1px solid rgba(255,255,255,0.18)' }}>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent px-4 py-4 font-mono text-[12px] uppercase tracking-[0.25em]"
              style={{ color: 'rgba(255,255,255,0.9)', outline: 'none' }}
            />
            <button type="submit" disabled={emailLoading || !email.trim()} className="px-5 font-mono text-[14px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {emailLoading ? '...' : '→'}
            </button>
          </div>
          {emailError && <p className="font-mono text-[10px] mt-2" style={{ color: 'rgba(255,100,100,0.7)' }}>{emailError}</p>}
        </form>
      )}

      {showPrice && (
        <span className="font-mono text-[13px]" style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em', marginTop: '8px' }}>
          $10
        </span>
      )}
    </div>
  )
}
```

### Task 6: Refactor `SovereignTile.tsx` to use `AuthModal`

In `components/SovereignTile.tsx`:
- Delete lines 214-264 (the inline `phase === 'auth'` block — google/apple buttons + price)
- Replace with `<AuthModal redirectAfterAuth={\`/${slug}?claim=1\`} showPrice={seedPhase === false} />`
- Delete `handleOAuth` (lines 128-140) — no longer needed, OAuthButton owns it
- Keep `phase === 'username'`, `phase === 'processing'`, `phase === 'ceremony'`, `init`, `finalize`, etc. untouched
- Keep the outer wrapper div (`fixed inset-0 z-50 ...`) and the dismiss handler — AuthModal slots into that wrapper

### Task 7: Refactor `app/[slug]/home/page.tsx` claimOverlay auth branch

In lines 1717-1736:
- Replace the contents of the `claimOverlay === 'auth'` branch (the `<>` wrapping `<OAuthButton google>` + `<OAuthButton apple>` + `<p>$10</p>`) with `<AuthModal redirectAfterAuth={\`/${slug}/home?claim=1\`} showPrice />`
- Keep the surrounding dark backdrop div, the conditional rendering on `claimOverlay !== 'closed'`, and the `claimOverlay === 'username'` branch untouched (the username branch shares the same parent div but is rendered separately by the ternary)

### Task 8: Verification

Vitest:
- `tests/passkey-support.test.ts` — 3 tests pass
- Full suite — 119/119 (existing 116 + 3 new) pass
- `tsc --noEmit` clean

Preview MCP:
1. `/ae?claim=1` (signed out) — assert DOM contains: Google button, Passkey button (Apple gated by env), "or" divider, email input, Continue/→ button
2. Click email submit with a fake address → verify the request fires and "check your email" appears
3. `/{some-slug}/home` (signed out) — assert same DOM structure (assert that the AuthModal component is rendered, not the inline JSX)
4. Screenshot proof of `/ae?claim=1` showing the new modal

## Files touched

| File | Action | Notes |
|---|---|---|
| `components/auth/passkey-support.ts` | CREATE | Tiny isPasskeySupported helper |
| `components/auth/PasskeyButton.tsx` | CREATE | WebAuthn ceremony, mirror OAuthButton style |
| `components/auth/AuthModal.tsx` | CREATE | The unified modal |
| `tests/passkey-support.test.ts` | CREATE | 3 tests for the helper |
| `components/SovereignTile.tsx` | MODIFY | Drop inline auth block + handleOAuth, render `<AuthModal />` |
| `app/[slug]/home/page.tsx` | MODIFY | Drop inline auth block, render `<AuthModal />` |

Total: 4 new files, 2 modified.

## Out of scope (pushed to PR #3)

- The 11 stale `/login` and `/signup` references
- Stripe success_url session_id drop in `app/api/publish/route.ts:416`
- `middleware.ts` `publicRoutes` cleanup
- URL parsing race in `SovereignTile` init effect (PublicPage cleans URL before SovereignTile reads `session_id`)
- Adding `Secure` flag to the post_auth_redirect cookie in `OAuthButton.tsx:29`
