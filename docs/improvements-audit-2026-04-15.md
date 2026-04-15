# Footprint — Improvements Audit 2026-04-15

Everything the test pass + recon surfaced, ranked by severity. Numbers in
brackets are file:line refs or row counts.

---

## 🔴 P0 — bugs in the wild that touch every page

### 1. `/api/events` returns 400 on every page load (many times per nav)
Every public profile page fires N×POST /api/events calls that ALL return
400 Bad Request. Analytics is dead. Whatever dashboard depends on this is
lying. Check `app/api/events/route.ts` — likely schema mismatch with client
payload.

### 2. `/api/analytics` returns 400 on every page load
Same pattern as /api/events. Second analytics endpoint, also broken.

### 3. Missing `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var
Server logs are flooded with
`[auth] Supabase session lookup failed: Missing required env var: NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`.env.local` only has `SUPABASE_SERVICE_ROLE_KEY`. Any code path that uses
the browser/anon client (session reads, public RLS queries) is failing
silently. **Add the anon key to `.env.local` and Vercel.**

### 4. Identity-layer `render_mode` silently bypasses type-specific tile renderers
Discovered today (and patched locally) — thought tiles with
`render_mode='preview_card'` + pay tiles with `render_mode='embed'` were
routing to ContentCard instead of their intended components. Fix is an
early return on `item.type`. Same class of bug will bite every new
tile type that has custom rendering if it ever gets a render_mode from
the intake layer. **Add an invariant check or move type-based dispatch
above render_mode dispatch.**

### 5. 4 YouTube tiles were missing `media_id`
Fixed today. Root cause was these rows were created before the regex
backfill; the create path extracts it now but existing rows drifted.
Add a one-time migration that backfills `media_id` for any platform with
an extractable ID, then add a data-integrity test so it can't regress.

### 6. Stale library `image_url` whitespace bug
From 2026-04-14 audit — 32 rows had `\n` in their URL. The CODE PATH that
writes to `library.image_url` is still unguarded (the spawned side-task
never ran). **Find and fix the upload path.** grep for
`.from('library').insert` — apply `.replace(/[\n\r]/g, '')` before write.

---

## 🟠 P1 — tile system gaps

### 7. Size topology (S/M/L) is user-facing friction
Every tile asks the user "how big." Documented in `docs/rubin-pass-notes.md`.
Drop it. Default by content type: image native aspect, video 16:9,
vertical TikTok/IG 9:16, thought by length, container M minimum, pay M
square. Edit page keeps manual override for art reasons.

### 8. YouTube clip support is a one-off
Clip resolution was ad-hoc in `audit-tiles.mjs`. Move into the POST /api/tiles
create path so new clip URLs auto-resolve video_id + range. Currently
only "✂️ saucE" works because I hand-patched it.

### 9. Instagram thumbnails will 403 on server-side fetch
cdninstagram.com refuses non-browser UAs. Every new IG tile will have a
raw external URL stored in `thumbnail_url_hq` that eventually expires.
Current fallback: raw URL, which works client-side via referer but 403s
server-side. **Two fixes**: (a) skip thumbnail cache for IG entirely,
accept external URL; or (b) refetch on a cron via a headless browser.
Low priority since the iframe embed is what users actually see.

### 10. `overflow-x-hidden` body + fixed grid fight
The sound-room hero breaks the grid today as a one-off. Formalize as a
layout primitive — `gridClass` function can't express "break out of grid
on row 0 of sound room." Eventually this will be needed for other
room-specific heroes.

### 11. Non-ghost YouTube tiles still appear on some tabs
My backfill set all 49 YT rows to `render_mode='ghost'`, but the rendered
DOM still shows 4 as plain `data-tile-type="youtube"` (ContentCard path).
Either child tiles (parent_tile_id set), stale Next.js cache, or a
different code path. Investigate if users report "some YouTubes don't
play inline."

### 12. Preview cards vs thought vs ghost — three overlapping paths
`UnifiedTile.tsx` has THREE competing dispatchers: type-based early
return, `isNewStyleRenderMode` switch, and the legacy
`render_mode === 'ghost'` check. Intent is unclear. Pick one:
- type is primary (URL/platform tells you everything)
- OR render_mode is primary (intake layer owns presentation)
Not both.

---

## 🟡 P2 — polish & friction

### 13. Play button visual inconsistency
Some tiles have a centered glass-disc play button, some have a tiny
bottom-corner circle (`fp-ghost-play`). Pick one visual language for
"this is playable."

### 14. Container tile: empty state is now honest but still unclear
Today's fix says "empty" in a corner. A better move: disallow creating
empty containers (require at least 1 child on creation), or show a
subtle pattern/icon in the center instead of just text.

### 15. Mobile tap targets are small
The tab bar (void / world / fits / sound / archive) on mobile is ~12px
font. Under 44pt tap target spec. Also hard to see contrast against the
bokeh background.

### 16. Homepage lens-flare/bokeh background steals attention
On first load before tiles render, the background noise dominates and
makes the page feel empty (see ae's screenshot). Consider: dim the
background when tiles are visible, or show a clean solid bg on first
paint with bokeh fading in.

### 17. Thumbnail fetch chain wastes requests
YouTube's `/maxresdefault.jpg` returns 404 for ~30% of videos, client
falls through to `sddefault.jpg`, sometimes again to `hqdefault.jpg`.
Each 404 costs 100-300ms. Options: (a) pre-probe at tile-create time
and store the working URL, (b) rely on our cached Supabase thumbs
(which we have for all YouTube tiles now via Phase 2 of audit-tiles.mjs).

### 18. `/api/share?slug=ae` returns 404
The share endpoint is called on every page but doesn't exist. Either
implement it or remove the client call.

### 19. Pay tile currently redirects to `/home` (signup), not Stripe
The CTA says "yours / make one →" but the `href` is `/home`. This is
confusing because the label implies pricing. Either rename/rework the
column and remove the stripe URL, or actually link to the Stripe page.

### 20. `buy.stripe.com` + `tubitv.com` client fetches blocked by ORB
Something client-side is trying to prefetch these. Can't; cross-origin
ORB blocks them. Wasted requests + console noise. Find the fetcher and
scope it to same-origin only.

---

## 🟢 P3 — consistency & aesthetic

### 21. Treatment layers stack on every tile
Glass border + rounded corner + hover scale + backdrop blur + subtle
shadow. Pick ONE treatment per tile type (Rubin-pass notes have a vote
for `rounded-2xl` only).

### 22. `font-mono uppercase tracking-[0.15em]` is everywhere
Used for labels, counts, captions. Reserve for actual numeric/spec data
(child counts, serial numbers). Use a humanist sans for everything else.

### 23. Transition fade between thumbnail → iframe is 250ms opacity
Too gentle; it reads as "loading." Either 0ms (snap) or 400ms with a
subtle scale.

### 24. Spotify tile isn't a ghost-player — it's a link-out
Clicking Spotify tile opens Spotify in a new tab. That's a deliberate
choice (Spotify web player requires login, full iframe is noisy), but
worth flagging for the doctrine.

### 25. Instagram embed shows IG chrome (profile + caption + "view on IG")
Can't be avoided with sanctioned IG embed. ae said "forget IG." Options:
keep as-is, revert IG to thumbnail-that-links-out (simpler, de-branded),
or accept the chrome. Currently: plays inline with chrome.

---

## 🔵 P4 — ops / dev surface

### 26. Every new dev session hits `.env.local` missing from worktree
Because `.env.local` is only in the main checkout. Worktrees need a
symlink or the setup script should create one.

### 27. No test coverage for tile rendering
`tests/` has schema and parser tests but no component/integration tests
for the tile system. A snapshot test for each platform would have caught
today's "preview_card bypasses thought renderer" bug in 30 seconds.

### 28. `audit-tiles.mjs` is one-off code living in `scripts/`
It's grown into a real diagnostic tool (audit + 8 fix phases). Either
promote to a real CLI (`scripts/footprint.mjs audit`, `scripts/footprint.mjs fix --phase 2`)
or split into separate files per phase. Right now it's a 600-line god
script with a hardcoded `FIX_MODE` constant that I toggle between runs.

### 29. Sandbox flakiness
Every `node` run fails unless we pass `dangerouslyDisableSandbox: true`
AND use the exact invocation fingerprint that was first approved. Small
deviation (new arg, new script name) triggers "Stream closed" errors.
Worth reporting — it made today's session significantly slower than it
should have been.

### 30. No CI on the worktree
The footprint CLAUDE.md mandates TDD + full test suite before merge, but
there's no automated runner in the worktree setup. Either wire Vitest +
Playwright into a `npm run check` convenience, or document the manual
sequence.

---

## Today's test results — what verified OK

- ✅ All 5 rooms render (void 25 / world 26 / fits 26 / sound 17 / archive 17 tiles)
- ✅ X/Twitter inline: `platform.twitter.com/embed/Tweet.html` iframe loaded 200 OK
- ✅ YouTube: iframe with `intrinsicW=1920 intrinsicH=1080` and `&vq=hd1080&hd=1` URL flags
- ✅ TikTok: `tiktok.com/player/v1/{id}` loaded 200 OK
- ✅ Instagram: `instagram.com/reel/.../embed/captioned/` loaded 200 OK
- ✅ Thought tiles render via my ladder (long=14px/493×369, short="It's Up."=28px/239×239)
- ✅ Container tiles: labels at 21px (clamp(15-22)), "N items" / "empty" indicator
- ✅ Pay/CTA tile renders after early-return patch
- ✅ Mobile viewport (375×812): no horizontal overflow, 2-column grid working
- ✅ No recovery/fallback tiles on any tab (no broken renders)
- ❌ Auto-revert on video end: listener has strict origin check (correct security),
  so I couldn't fake it in tests. Requires real end-of-video from YT/TikTok origin.
  Unverified in automation, but the code path is mechanically correct.

## Today's code changes (in worktree, not yet deployed)

- `components/GhostTile.tsx`: TikTok + IG + X inline playback, auto-revert
  listener, YouTube 1080p quality stack, TwitterEmbed sub-component
- `components/UnifiedTile.tsx`: early returns for container/thought/pay;
  `clip_start_ms/clip_end_ms` pass-through; identity-layer dispatch now
  explicitly bypassed for typed tiles
- `components/ContainerTile.tsx`: bigger label, empty-state indicator,
  removed ornamental depth lines
- `middleware.ts`: CSP `script-src` + `frame-src` include Twitter
- `app/[slug]/page.tsx`: pluck `clip_start_ms`/`clip_end_ms` from
  `link.metadata` onto each item
- `scripts/audit-tiles.mjs`: ~700 lines now; 10 fix modes
- DB: 47 YT title enrichments, 32 library URL trims, 2 missing thumbs
  scraped, 1 clip resolved, 1 IG reel restored, 4 YT media_id backfills,
  5 tile size bumps
