# Env Diff — 1c61f60 vs main

**Compared revisions:**
- Base: `1c61f601a2f4a80e560227ee253ad6496fbf4158` (1c61f60, Feb 3 2026)
- Target: `2e95bb319d34e98e359fedd2c140c5e74630eb56` (main, Apr 18 2026)

**Method:** static grep of `process.env.*` references in `.ts`, `.tsx`, `.js`, `.mjs` files tracked at each revision via `git grep process.env`. Only variables actually referenced in source code are listed. No inference from documentation, `.env.example`, or runtime behavior.

---

## Environment variables referenced at 1c61f60 (8)

```
JWT_SECRET
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
NODE_ENV
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

## Environment variables referenced at main (34)

```
ANTHROPIC_API_KEY
APOLLO_API_KEY
ARO_ADMIN_EMAILS
ARO_KEY
AUDIT_JSON
AUDIT_USER
CI
CRON_SECRET
FP_BASE_URL
GOOGLE_API_KEY
GOOGLE_CX
GOOGLE_PLACES_API_KEY
JWT_SECRET
LOG_LEVEL
MAILGUN_API_KEY
MAILGUN_DOMAIN
MAX_PER_VERTICAL
MIN_INTERVAL_MS
NEXT_PUBLIC_APPLE_ENABLED
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
NODE_ENV
PAGE_LOAD_MS
PLAYWRIGHT_BASE_URL
POLL_INTERVAL_MS
PUBLISH_DAILY_CAP
PUBLISH_MODE
RESEND_API_KEY
SENDGRID_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
VERCEL_URL
```

---

## Delta

### Present at 1c61f60 and at main (8, shared core)
```
JWT_SECRET
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
NODE_ENV
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

### Added between 1c61f60 and main (26)
```
ANTHROPIC_API_KEY
APOLLO_API_KEY
ARO_ADMIN_EMAILS
ARO_KEY
AUDIT_JSON
AUDIT_USER
CI
CRON_SECRET
FP_BASE_URL
GOOGLE_API_KEY
GOOGLE_CX
GOOGLE_PLACES_API_KEY
LOG_LEVEL
MAILGUN_API_KEY
MAILGUN_DOMAIN
MAX_PER_VERTICAL
MIN_INTERVAL_MS
NEXT_PUBLIC_APPLE_ENABLED
PAGE_LOAD_MS
PLAYWRIGHT_BASE_URL
POLL_INTERVAL_MS
PUBLISH_DAILY_CAP
PUBLISH_MODE
RESEND_API_KEY
SENDGRID_API_KEY
SUPABASE_URL
VERCEL_URL
```

### Removed between 1c61f60 and main
none

---

## Summary

A 1c61f60 preview build requires only 8 environment variables — all of which still exist in main. If the Vercel project hosting this preview already has its environment configured for main, a 1c61f60 build will find every variable it reads. The 26 additional vars that main introduces (ARO, Resend, Mailgun, Google, Anthropic, Apollo, audit, publish/poll tuning, Vercel cron secrets) are not read by any code at 1c61f60; their absence will not affect a 1c61f60 build, and their presence (extra env in the Vercel project) will not affect it either. `vercel.json` at 1c61f60 hard-codes `NEXT_PUBLIC_APP_URL` to `"https://your-domain.com"` — this is a repo default and will be overridden by the Vercel project env if one is set. No inference has been made about which values the Vercel project actually holds; only the set of names read by source at each revision is reported here.
