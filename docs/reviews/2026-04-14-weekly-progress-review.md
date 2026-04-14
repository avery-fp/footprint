# Weekly Progress Review — 2026-04-08 → 2026-04-14

## Context

Generated in response to "Have we progressed this code at all in last week…like what is even happening" — a status inquiry driven by a feeling of disconnect from shipping velocity. This review surfaces what shipped, what's unfinished, and the thematic arcs. No code changes required by this document; it's a retrospective artifact.

## The short answer: yes, a lot.

- **63 commits** in the last 7 days (Apr 8 → Apr 14, 2026)
- **55 by avery-fp, 7 by ae, 1 by Claude**
- **~910 files touched** (~206k insertions, ~3.3k deletions — insertions inflated by package-lock / generated assets)
- Busiest days: Apr 9 (24 commits), Apr 11 (14), Apr 12/13 (8 each)
- Mix: 21 `fix:`, 11 `feat:`, rest merges/unlabeled
- **0 open PRs; 34 PRs merged this week**

## Thematic arcs

### 1. Auth spine — rewritten, then stabilized (Apr 9–14)
The single largest investment. From `Fix state auth identity mapping` through `fix(auth): collapse implicit flow, pin PKCE, dual-branch callback`:
- Home-first auth flow (#209), unified sign-in/sign-up entry (#217)
- Fixed the "every sign-in collapses onto ae's page" routing bug (#223)
- SSR Google auth restoration, cookie-callback types, session-email ownership hardening
- Post-auth redirect to own space (#224), claim-flow made username-first
- Supabase cookie cleanup wrapped in try/catch
- Final: PKCE pinning + dual-branch callback (e1c7f2a, Apr 14)

### 2. FIDELIO / content intake layer (Apr 11–14) — new subsystem
- #214 — identity intake layer: media ontology, provider adapters, resolve endpoint, renderMode dispatch (+1,852 lines)
- #234 — cache social thumbnails to permanent storage
- #235 — universal link parser + lazy social embeds (+621 lines)
- #236 — copy-content-on-upload across all FIDELIO platforms

### 3. Video lane — built then cut on the same day (Apr 11)
- **07:30 AM** — af1a960 landed Mux upload + webhook + HLS playback (Phase 2, +604 lines, 19 files)
- **~Midday** — #7987800 video theatre mode (maximize, scrub bar) (+540 lines)
- **08:38 PM** — b345de8 cut the entire Mux/VideoTile lane (–861 lines), kept only YouTube/Instagram/X embeds

### 4. Tile / visual system (Apr 12–14)
- Typography overhaul — DM Sans primary, weight hierarchy (#227)
- Field Mode — blurred poster replaces black letterbox (#226)
- 3-state tile topology — S/M/L shape-from-size (#238)
- Double-tap zoom cycling 1x→2x→3x (#215)
- Ghost-tile rendering fix + TikTok thumbnail caching (#237, Apr 14)

### 5. Security / infra (Apr 11)
- Next.js 14.0.4 → 14.2.35 (19 CVEs) (#213)
- Lazy-init Stripe client to stop build-time env evaluation (#212)
- Security headers applied to unauth redirect in middleware (#211)

### 6. Misc UX polish
- Landing page removed, root redirects to /home (#230)
- Email capture bar on public pages (#232)
- See → build → share: inline auth bar, dead-code purge (#233, net –256 lines)
- YouTube 144p param strip (#218), thumbnail quality fix, iPhone Safari viewport stability

## Hotspots (most-touched files this week)

| File | Touches |
|------|---------|
| `components/ContentCard.tsx` | 15 |
| `app/[slug]/home/page.tsx` | 13 |
| `components/UnifiedTile.tsx` | 11 |
| `app/api/tiles/route.ts` | 10 |
| `middleware.ts` | 9 |
| `components/GhostTile.tsx` | 9 |
| `app/auth/callback/route.ts` | 9 |
| `lib/auth.ts` | 8 |

Tile rendering + auth callback are the churn centers.

## Deep dive 1: The Mux add/cut on Apr 11 — pivot, not thrash

Same author (`ae`, human), same day, ~13 hours apart:

- **07:30 AM** — af1a960 "land processed video lane (Phase 2) — Mux upload, webhook, HLS playback". Commit message: "Cherry-pick of **sealed** Phase 2 work onto main." +604 / –77 across 19 files. Added: `app/api/upload/video/route.ts`, `app/api/webhooks/video/route.ts`, `lib/video-provider.ts`, `lib/video-providers/mux.ts`, `VideoTile` HLS playback, `media_kind` column, migration 019.
- **08:38 PM** — b345de8 "cut video upload lane: remove Mux, VideoTile, keep YouTube/Instagram/X embeds". +27 / –861 across 10 files. Deleted every file added that morning. Migration 020 explicitly cleans up stuck video tiles.

**Verdict: deliberate scope reduction, not rollback.** The cut is phrased as a scope decision ("keep YouTube/Instagram/X embeds") — not "revert" or "fix broken video lane". Likely sequence: shipped the full Mux lane, tried it, decided user-uploaded phone video wasn't worth the operational weight when embeds cover the use case. ~861 lines of infra deleted in exchange for a simpler product surface. `ae` on both ends reinforces this as a product call, not agent churn.

## Deep dive 2: Auth is **not** settled

21 auth-themed commits across **every single day** of the week. `app/auth/callback/route.ts` alone has been rewritten essentially end-to-end:

| Date | Commit | What it did |
|------|--------|-------------|
| Apr 9 | 5d1821b | restore SSR Google auth flow on main |
| Apr 10 | fd0e9de | #209 home-first auth + state mgmt (large) |
| Apr 11 | c5c25c4 | stage OAuth callback errors so the loop is diagnosable |
| Apr 12 | 7ef4b0a | #223 stop collapsing every sign-in onto ae's page |
| Apr 13 | ddf2454 | #233 inline auth bar as part of see→build→share |
| **Apr 14** | **e1c7f2a** | **collapse implicit flow, pin PKCE, dual-branch callback** |

Today's commit (e1c7f2a) is the red flag. The commit message describes "a basis-mismatch between the SSR-PKCE flow and a lingering implicit-flow code path" — meaning up until today, the stack had **two incompatible auth flows coexisting**. The fix pins `flowType: 'pkce'`, disables URL-fragment parsing, and dual-branches the callback (`?code=` → PKCE, `?token_hash=&type=` → verifyOtp for cross-browser magic links). This is a structural rewrite, not polish.

**Verdict: needs real-user verification end-to-end.** Specifically:

- [ ] (a) Same-browser Google SSO on prod origin
- [ ] (b) Cross-browser magic-link via Gmail-opened-in-Safari flow
- [ ] (c) Expired OTP error surfacing in the modal (SovereignTile now reads `auth_error` from search params)

Until those three paths are manually walked on prod, treat auth as "probably fixed, unconfirmed." Given the cadence — a new auth fix every day for six days — the pattern says another regression is likely without explicit verification gates.

## Deep dive 3: Open PRs / in-flight work — nothing parked

- **0 open PRs** on `avery-fp/footprint`
- 34 PRs merged in the last 7 days (all the week's feature/fix work)
- Only 3 remote branches show commits in the last week: `main`, current review branch, `claude/determined-hermann` (Apr 10, stale — matches #209 which merged as `fd0e9de`)
- The repo has ~30+ `claude/*` branches but they're stale feature explorations, not active work

**Verdict: the disconnect isn't because work is hidden in drafts — it's because everything ships immediately and flows past.** At 63 commits / 34 merged PRs in a week, there's no in-flight buffer to scan. If the goal is visibility, the fix isn't "find the parked work," it's "slow the merge cadence" or "batch into daily digests." Separately: the stale `claude/*` branches are cleanup debt worth a sweep (low priority).

## Recommendations

1. **Walk the three auth paths on prod today** — Google SSO, cross-browser magic link, expired OTP. Highest-leverage verification given e1c7f2a just shipped.
2. **Decide whether the Mux cut is permanent** — if yes, mark in product notes so it doesn't get re-proposed; if no, the infra is preserved in git history at af1a960 and can be restored.
3. **Consider a "what shipped" daily digest** — with zero open PRs and this merge rate, a passive feed is the only way to maintain situational awareness without reading every commit.

## Method

Read-only inspection:
- `git log --all --since="7 days ago"` (63 commits confirmed)
- `git show` on af1a960 and b345de8 for Mux arc
- `git log -- app/auth/callback/route.ts` for auth hotspot timeline
- `mcp__github__list_pull_requests state=open` → empty array
- `mcp__github__search_pull_requests` closed/merged → 34 PRs
