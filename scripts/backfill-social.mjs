#!/usr/bin/env node
/**
 * Backfill social tile metadata (Twitter, Instagram, TikTok).
 *
 * Re-enriches existing tiles that have no thumbnail or default titles.
 * - Twitter:    oEmbed → extract tweet text + author
 * - Instagram:  og:image scrape with browser UA
 * - TikTok:     oEmbed → thumbnail + title + author
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-social.mjs                  # run (max 100 rows)
 *   node --env-file=.env.local scripts/backfill-social.mjs --dry-run        # preview only
 *   node --env-file=.env.local scripts/backfill-social.mjs --limit 50       # cap at 50 rows
 */
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 100

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── Enrichment functions ────────────────────────────────────

async function enrichTwitter(url) {
  const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null

  const data = await res.json()
  let tweetText = null
  if (data.html) {
    const pMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    if (pMatch) {
      tweetText = pMatch[1].replace(/<[^>]+>/g, '').trim() || null
    }
  }

  return {
    title: tweetText,
    artist: data.author_name || null,
    thumbnail_url_hq: null, // Twitter oEmbed has no thumbnail
  }
}

async function enrichInstagram(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  })
  if (!res.ok) return null

  const html = await res.text()
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1]

  return {
    title: ogTitle ? ogTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : null,
    artist: null,
    thumbnail_url_hq: ogImage || null,
  }
}

async function enrichTiktok(url) {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null

  const data = await res.json()
  return {
    title: data.title || null,
    artist: data.author_name || null,
    thumbnail_url_hq: data.thumbnail_url || null,
  }
}

const enrichers = {
  twitter: enrichTwitter,
  instagram: enrichInstagram,
  tiktok: enrichTiktok,
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔄 Social tile backfill${DRY_RUN ? ' (DRY RUN)' : ''} — limit ${LIMIT}\n`)

  // Find tiles that need enrichment: no thumbnail AND default title
  const { data: rows, error } = await supabase
    .from('links')
    .select('id, url, platform, title, artist, thumbnail_url_hq')
    .in('platform', ['twitter', 'instagram', 'tiktok'])
    .is('thumbnail_url_hq', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (error) {
    console.error('DB query failed:', error.message)
    process.exit(1)
  }

  // Also grab rows with default titles (even if thumbnail_url_hq is set for some reason)
  const { data: defaultTitleRows, error: err2 } = await supabase
    .from('links')
    .select('id, url, platform, title, artist, thumbnail_url_hq')
    .in('platform', ['twitter', 'instagram', 'tiktok'])
    .or('title.like.Tweet by %,title.eq.Instagram Post,title.eq.TikTok Video')
    .limit(LIMIT)

  if (err2) {
    console.error('DB query (default titles) failed:', err2.message)
  }

  // Merge and deduplicate
  const allRows = [...(rows || [])]
  const seenIds = new Set(allRows.map(r => r.id))
  for (const r of (defaultTitleRows || [])) {
    if (!seenIds.has(r.id)) {
      allRows.push(r)
      seenIds.add(r.id)
    }
  }

  if (allRows.length === 0) {
    console.log('✅ No tiles need enrichment.')
    return
  }

  console.log(`Found ${allRows.length} tile(s) to process:\n`)

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const row of allRows) {
    const enricher = enrichers[row.platform]
    if (!enricher) { skipped++; continue }

    console.log(`  [${row.platform}] ${row.url}`)
    console.log(`    current: title="${row.title}" thumb=${row.thumbnail_url_hq ? 'yes' : 'null'} artist=${row.artist || 'null'}`)

    try {
      const result = await enricher(row.url)
      if (!result) {
        console.log(`    ⚠ enrichment returned null`)
        failed++
        await delay(1000)
        continue
      }

      // Build update payload — only set fields that improved
      const updates = {}
      if (result.title && (!row.title || row.title.startsWith('Tweet by ') || row.title === 'Instagram Post' || row.title === 'TikTok Video')) {
        updates.title = result.title
      }
      if (result.artist && !row.artist) {
        updates.artist = result.artist
      }
      if (result.thumbnail_url_hq && !row.thumbnail_url_hq) {
        updates.thumbnail_url_hq = result.thumbnail_url_hq
      }
      // Always ensure render_mode is ghost for enriched tiles
      updates.render_mode = 'ghost'

      if (Object.keys(updates).length <= 1) {
        // Only render_mode, no real data improvement
        console.log(`    → no new data found`)
        skipped++
        await delay(1000)
        continue
      }

      console.log(`    → updates: ${JSON.stringify(updates, null, 0).slice(0, 120)}`)

      if (!DRY_RUN) {
        const { error: updateErr } = await supabase
          .from('links')
          .update(updates)
          .eq('id', row.id)

        if (updateErr) {
          console.log(`    ✗ DB update failed: ${updateErr.message}`)
          failed++
        } else {
          console.log(`    ✓ updated`)
          updated++
        }
      } else {
        console.log(`    → would update (dry run)`)
        updated++
      }
    } catch (e) {
      console.log(`    ✗ error: ${e.message || e}`)
      failed++
    }

    await delay(1000)
  }

  console.log(`\n📊 Results: ${updated} updated, ${skipped} skipped, ${failed} failed\n`)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(e => { console.error(e); process.exit(1) })
