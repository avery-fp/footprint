# Schema Diff — 1c61f60 vs main

**Compared revisions:**
- Base: `1c61f601a2f4a80e560227ee253ad6496fbf4158` (1c61f60, Feb 3 2026, "THE GOLDEN BUILD")
- Target: `2e95bb319d34e98e359fedd2c140c5e74630eb56` (main, Apr 18 2026 HEAD)

**Source of truth for this diff:** repo-tracked SQL files only (`schema.sql` + `supabase/migrations/*.sql`). Production database state is **UNKNOWN** and not inferred here — see UNKNOWN section at bottom.

---

## Migration files present

| Path | 1c61f60 | main |
|---|---|---|
| `schema.sql` | present (279 lines) | present (577 lines) |
| `supabase/migrations/` directory | **does not exist** | present, 23 files |
| `sql/aro_tables.sql` | does not exist | present |

At 1c61f60 the only repo-tracked SQL artifact is `schema.sql`. The `supabase/migrations/` directory was introduced later.

## Migrations added between 1c61f60 and main (file-level)

```
supabase/migrations/001_aro.sql
supabase/migrations/002_monetization.sql
supabase/migrations/003_aspect_ratio.sql
supabase/migrations/003_atomic_promo_increment.sql
supabase/migrations/004_add_interactive_column.sql
supabase/migrations/005_missing_aro_tables.sql
supabase/migrations/006_username_reservations.sql
supabase/migrations/008_aro_rate_limit_functions.sql
supabase/migrations/009_aro_publish_tables.sql
supabase/migrations/010_aro_functions_indexes.sql
supabase/migrations/011_aro_jobs.sql
supabase/migrations/012_ghost_tiles.sql
supabase/migrations/013_daemon_columns.sql
supabase/migrations/013_gifts.sql
supabase/migrations/014_display_title_and_footprint_states.sql
supabase/migrations/014_email_unsubscribes.sql
supabase/migrations/015_container_tiles.sql
supabase/migrations/016_auth_and_passkeys.sql
supabase/migrations/017_swarm_tables.sql
supabase/migrations/018_seed_phase.sql
supabase/migrations/019_video_provider.sql
supabase/migrations/020_remove_stuck_video_tiles.sql
supabase/migrations/021_tile_medium_state.sql
```

Migrations removed between 1c61f60 and main: **none** (no migration directory existed at 1c61f60).

## `schema.sql` deltas (repo-level, derived from `git diff 1c61f60..main -- schema.sql`)

### users table
- ADDED: `password_hash TEXT`
- ADDED: `referred_by VARCHAR(255)`

### footprints table
- RENAMED (via DO-block): `slug` → `username`
- RENAMED (via DO-block): `theme` → `dimension`
- RENAMED (via DO-block): `is_public` → `published`
- ADDED: `serial_number INTEGER UNIQUE REFERENCES serials(number)`
- ADDED: `display_title VARCHAR(255)`
- ADDED: `grid_mode VARCHAR(50) DEFAULT 'breathe'`
- ADDED: `background_url TEXT`
- ADDED: `background_blur BOOLEAN DEFAULT TRUE`
- ADDED: `weather_effect VARCHAR(50)`
- Unique constraint changed from `UNIQUE(user_id, slug)` → `UNIQUE(username)`
- Index renamed: `idx_footprints_slug` → `idx_footprints_username`
- New index: `idx_footprints_serial`
- Changed: `user_id` is no longer `NOT NULL` (nullable in main)

### content → library + links (structural split)
- REMOVED table: `content` (single unified content table, FK `footprint_id`)
- ADDED table: `library` (image tiles, FK `serial_number`, columns `image_url`, `caption`, `size`, `aspect`, `room_id`)
- ADDED table: `links` (non-image tiles, FK `serial_number`, columns `url`, `platform`, `thumbnail`, `embed_url`, `metadata JSONB`, `size`, `aspect`, `room_id`)

### New tables in main (not in 1c61f60)
- `rooms` — FK `serial_number`, name/position/hidden
- `footprint_states` — FK `footprint_id`, JSONB snapshot, name
- Plus all tables created by the 23 migration files (ARO tables, gifts, email_unsubscribes, swarm, seed_phase, container_tiles, passkeys, username_reservations, video_provider, tile_medium_state — not enumerated here; see migration filenames above for scope signal)

### Unchanged
- `serials` table and `claim_next_serial()` function (whitespace-only diff)
- `magic_links` table and `cleanup_magic_links()` function (identical)
- `payments` table (identical)
- `page_views` table (identical except main adds `idx_page_views_footprint_date`)

### RLS policies
- 1c61f60 enables RLS on: `users`, `footprints`, `content`
- main enables RLS on: `users`, `footprints`, `library`, `links`, `rooms`, `footprint_states`
- Policies rewritten to key off `serial_number` ownership chain in main; at 1c61f60 policies key off `footprint_id`

### Server-side migration block in main's schema.sql
main includes a bottom migration block (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DO $$ ... RENAME COLUMN`, `CREATE TABLE IF NOT EXISTS`) designed to upgrade a 1c61f60-era database in place. This block exists in the file at main but has **NOT been verified as executed against any production database** as part of this audit.

---

## UNKNOWN — production state not derivable from repo

The following cannot be determined from the git record and are not inferred:

1. Which schema the production Supabase project currently has.
2. Whether any migrations from `supabase/migrations/*` have been run against production.
3. Whether the in-place migration block at the bottom of main's `schema.sql` has been executed against production.
4. Which schema a newly-built deploy of 1c61f60 would expect to find when it queries production Supabase. If the deploy points at the current production project and that project has main-era columns/tables, a 1c61f60 build will encounter:
   - `content` table: LIKELY MISSING (renamed/split to library+links)
   - `footprints.slug`: LIKELY RENAMED to `username`
   - `footprints.theme`: LIKELY RENAMED to `dimension`
   - `footprints.is_public`: LIKELY RENAMED to `published`

   The word LIKELY is marked because repo migrations are a claim, not a verification. Production state is UNKNOWN.

This UNKNOWN is load-bearing for the preview verification: a 1c61f60 preview build that points at the current production Supabase may break on schema mismatch before the user flow can be tested. That outcome, if observed, will appear as a Step 0 build-time or a Step N runtime failure in the report.
