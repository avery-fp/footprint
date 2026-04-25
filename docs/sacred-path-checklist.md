# Footprint Sacred Path Checklist

Production verified:
- /ae loads public showcase
- make yours creates anonymous draft
- draft editor opens without auth
- image tile upload works
- text tile works
- link tile works
- wallpaper renders
- Go live $10 opens Stripe Checkout
- Stripe payment succeeds
- Stripe redirects to /claim/success?session_id=...
- /api/claim/complete verifies the session
- draft promotes to claimed slug
- user lands on /{slug}/home?claimed=true
- public /{slug} renders
- webhook is backup only
- no black claim page after payment
- no email dependency for primary claim flow

Do not edit payment/auth/claim architecture without running this checklist.

## Spine — files that own the sacred path

- `app/api/checkout/route.ts` — issues Stripe Checkout Sessions; success_url
  is `/claim/success?session_id={CHECKOUT_SESSION_ID}`. Reserves the slug
  in `slug_reservations` after Stripe acceptance.
- `app/claim/success/page.tsx` — primary post-payment landing. POSTs the
  session_id to `/api/claim/complete`, cookies the edit_token via
  `/api/edit-unlock`, redirects to `/{slug}/home?claimed=true`.
- `app/api/claim/complete/route.ts` — synchronous server endpoint.
  Retrieves the Stripe session via STRIPE_SECRET_KEY, asserts
  `payment_status === 'paid'`, calls the shared promotion function.
- `lib/claims/complete-paid-claim.ts` — single source of truth for
  draft → claimed footprint promotion. Idempotent on
  `payments.stripe_session_id`. Used by both the webhook and the
  synchronous endpoint.
- `app/api/webhook/route.ts` — Stripe `checkout.session.completed` backup.
  Verifies signature, delegates to the same shared function. Failure here
  no longer blocks the user.
- `app/not-found.tsx` — if the URL has `session_id`, hijacks to
  `/claim/success?session_id=...` so paying customers never see the
  visitor view.

## Off-limits without a fresh checklist run

Do not modify any of these without verifying every line above on prod
afterward:

- `lib/claims/complete-paid-claim.ts`
- `app/api/claim/complete/route.ts`
- `app/api/webhook/route.ts`
- `app/api/checkout/route.ts`
- `app/api/draft/create/route.ts`
- `app/api/edit-unlock/route.ts`
- `lib/edit-auth.ts`
- `lib/stripe.ts`
- Supabase schema (footprints, users, payments, slug_reservations)

## Failure modes to watch for

- **Webhook signature mismatch.** Hit `/api/webhook` (GET) — confirm
  `secretLoaded: true` and the prefix matches the active dashboard
  endpoint. Webhook failure should never strand a paid user; the sync
  path handles them. But if the webhook backup is dead too, retries
  on closed-tab edge cases are gone.
- **Stripe session not paid yet on return.** `/claim/success` retries
  once on a 402; if it still fails, shows the soft "try again" copy.
- **Draft serial reuse.** Drafts pre-claim a `serial_number` (PK).
  The promotion path must NOT mutate `serial_number` — five tables
  FK to it. The shared function reuses the draft's serial; if no
  draft, claims a fresh one via `claim_next_serial` RPC.
- **Slug collision.** If someone else's claimed footprint already
  holds the desired slug, the shared function falls back to
  `{desired}-{serial}` automatically.
