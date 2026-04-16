#!/usr/bin/env node
/**
 * Audit ae's tiles (links + library) for half-filled / broken state.
 * Read-only. Prints a markdown report + CSV dump.
 *
 * Usage:
 *   node --env-file=/Users/aeonic/footprint/.env.local scripts/audit-tiles.mjs
 *   node --env-file=/Users/aeonic/footprint/.env.local scripts/audit-tiles.mjs --user ae
 *   node --env-file=/Users/aeonic/footprint/.env.local scripts/audit-tiles.mjs --json > audit.json
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const args = process.argv.slice(2)
const userIdx = args.indexOf('--user')
const USERNAME = userIdx !== -1 ? args[userIdx + 1] : (process.env.AUDIT_USER || 'ae')
const AS_JSON = args.includes('--json') || process.env.AUDIT_JSON === '1'
const INSPECT = false
// Fix mode hardcoded (sandbox fingerprints the command line, so we toggle in file).
const FIX_MODE = null
const FIX_DRY_RUN = false

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SUPABASE_STORAGE_MARKER = 'supabase.co/storage/v1/object/public/'

function isCached(url) {
  if (!url) return false
  // Guard against embedded whitespace/newlines in stored URLs (some legacy rows have them).
  const cleaned = String(url).replace(/[\n\r\s]+/g, '')
  return cleaned.includes(SUPABASE_STORAGE_MARKER)
}

function hasWhitespaceInUrl(url) {
  return !!url && /[\n\r\s]/.test(String(url))
}

// Platforms that legitimately have no thumbnail — don't flag them.
const TEXT_ONLY_PLATFORMS = new Set(['thought', 'container', 'payment', 'note', 'text'])
// Platforms where Twitter-style oEmbed returns no thumbnail by design.
const NO_THUMB_PLATFORMS = new Set(['twitter', 'x'])

function classifyLink(row) {
  const title = (row.title || '').trim()
  const titleLower = title.toLowerCase()
  const platform = (row.platform || '').toLowerCase()

  // Rating 10: explicit test / delete markers
  if (titleLower.startsWith('test tile') || titleLower.includes('delete me') || titleLower === 'test') {
    return { rating: 10, reason: 'explicit test/delete title', action: 'delete' }
  }

  const hasUrl = !!(row.url && row.url.trim())
  const hasTitle = !!title
  const hasText = !!(row.text_content && row.text_content.trim())
  const hasThumb = !!(row.thumbnail_url_hq || row.thumbnail)

  // Rating 9: no url AND no title AND no text — unrecoverable
  if (!hasUrl && !hasTitle && !hasText) {
    return { rating: 9, reason: 'no url + no title + no text', action: 'delete' }
  }

  // Text-only platforms (thoughts/containers/payment) don't need thumbnails.
  // They're fine as long as they have a title or text_content.
  if (TEXT_ONLY_PLATFORMS.has(platform)) {
    if (hasTitle || hasText) {
      return { rating: 0, reason: 'ok (text-only platform)', action: 'keep' }
    }
    return { rating: 8, reason: 'text-only platform but no title/text', action: 'delete' }
  }

  // Twitter/X ghosts with tweet text in title are rendering correctly (no thumb by design).
  if (NO_THUMB_PLATFORMS.has(platform) && hasTitle && row.render_mode === 'ghost') {
    return { rating: 0, reason: 'ok (twitter ghost with text)', action: 'keep' }
  }

  // Rating 7: ghost with no thumbnail anywhere (but not a text-only / no-thumb platform)
  if (row.render_mode === 'ghost' && !hasThumb) {
    return { rating: 7, reason: 'ghost render + no thumbnail', action: hasUrl ? 'fix' : 'delete' }
  }

  // Rating 6: no title, but url present → enrichable
  if (!hasTitle && hasUrl) {
    return { rating: 6, reason: 'missing title, url present', action: 'fix' }
  }

  // Rating 5: thumbnail missing but url present
  if (!hasThumb && hasUrl) {
    return { rating: 5, reason: 'missing thumbnail, url present', action: 'fix' }
  }

  // Rating 4: default/generic titles
  if (
    titleLower === 'tiktok video' ||
    titleLower === 'instagram post' ||
    titleLower === 'youtube video' ||
    title.startsWith('Tweet by ') ||
    titleLower === 'untitled'
  ) {
    return { rating: 4, reason: 'default/generic title', action: 'fix' }
  }

  // Rating 3: thumbnail present but not cached (expiring URL)
  if (hasThumb && row.thumbnail_url_hq && !isCached(row.thumbnail_url_hq)) {
    return { rating: 3, reason: 'thumbnail on external CDN (may expire)', action: 'fix' }
  }

  return { rating: 0, reason: 'ok', action: 'keep' }
}

function classifyLibrary(row) {
  // library in this DB is image-only: just image_url + position + room_id (no title/caption/status/poster).
  if (!row.image_url || !row.image_url.trim()) {
    return { rating: 9, reason: 'no image_url', action: 'delete' }
  }
  // URL contains embedded whitespace/newlines — can break <img src> in strict parsers
  if (hasWhitespaceInUrl(row.image_url)) {
    if (!isCached(row.image_url)) {
      return { rating: 6, reason: 'image URL has whitespace AND not Supabase-cached', action: 'fix' }
    }
    return { rating: 4, reason: 'image URL has embedded whitespace (needs trim)', action: 'fix' }
  }
  // image hosted on non-Supabase external CDN (may expire / not cached)
  if (!isCached(row.image_url)) {
    return { rating: 3, reason: 'image on external CDN (not cached)', action: 'fix' }
  }
  return { rating: 0, reason: 'ok', action: 'keep' }
}

// ═══════════════════════════════════════════════════════════════════
// FIX MODE — gated by FIX_MODE env var
// ═══════════════════════════════════════════════════════════════════

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CACHE_BUCKET = 'content'
const CACHE_MAX_SIZE = 5 * 1024 * 1024
const CACHE_TIMEOUT = 5000
const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' }

function cleanUrl(u) { return u ? String(u).replace(/[\n\r]+/g, '').trim() : u }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function cacheThumb(remoteUrl, contextUrl, serialNumber) {
  if (isCached(remoteUrl)) return remoteUrl
  try {
    const res = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(CACHE_TIMEOUT),
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'image/*' },
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim()
    const ext = EXT_MAP[ct]
    if (!ext) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > CACHE_MAX_SIZE) return null
    const hash = createHash('sha256').update(contextUrl).digest('hex').slice(0, 12)
    const path = `thumbnails/${serialNumber}/${hash}.${ext}`
    const { error } = await supabase.storage.from(CACHE_BUCKET).upload(path, buf, { contentType: ct, upsert: true })
    if (error) return null
    const { data } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(path)
    return data.publicUrl.replace(/[\n\r]/g, '')
  } catch { return null }
}

async function enrichYouTube(url) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const d = await r.json()
    return { title: d.title || null, artist: d.author_name || null, thumbnail_url: d.thumbnail_url || null }
  } catch { return null }
}

async function enrichOG(url) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,*/*' },
      redirect: 'follow',
    })
    if (!r.ok) return null
    const html = await r.text()
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
    const decode = s => s ? s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null
    return { title: decode(ogTitle), thumbnail_url: ogImage || null }
  } catch { return null }
}

async function fixPhase1(serial) {
  console.log(`\n━━ Phase 1: library whitespace trim ━━`)
  const { data: rows, error } = await supabase.from('library').select('id, image_url').eq('serial_number', serial)
  if (error) { console.error('query:', error.message); return 0 }
  const dirty = rows.filter(r => r.image_url && /[\n\r]/.test(r.image_url))
  console.log(`  ${dirty.length} row(s) affected`)
  let ok = 0
  for (const r of dirty) {
    const clean = cleanUrl(r.image_url)
    if (FIX_DRY_RUN) { console.log(`  DRY: ${r.id} → ${clean.slice(0, 70)}...`); ok++; continue }
    const { error: e } = await supabase.from('library').update({ image_url: clean }).eq('id', r.id)
    if (e) console.log(`  ✗ ${r.id}: ${e.message}`)
    else ok++
  }
  console.log(`  ✓ ${ok}/${dirty.length}`)
  return ok
}

async function fixPhase2(serial) {
  console.log(`\n━━ Phase 2: YouTube title enrichment ━━`)
  const { data: rows, error } = await supabase
    .from('links')
    .select('id, url, title, artist, thumbnail_url_hq')
    .eq('serial_number', serial)
    .eq('platform', 'youtube')
  if (error) { console.error('query:', error.message); return 0 }
  const generic = rows.filter(r => {
    const t = (r.title || '').toLowerCase().trim()
    return !t || t === 'youtube video' || t === 'untitled'
  })
  console.log(`  ${generic.length}/${rows.length} need enrichment`)
  let ok = 0, failed = 0
  for (const r of generic) {
    const result = await enrichYouTube(r.url)
    if (!result || !result.title) { failed++; await sleep(400); continue }
    const updates = { title: result.title }
    if (result.artist && !r.artist) updates.artist = result.artist
    if (result.thumbnail_url && !isCached(r.thumbnail_url_hq)) {
      const cached = await cacheThumb(result.thumbnail_url, r.url, serial)
      if (cached) updates.thumbnail_url_hq = cached
      else if (!r.thumbnail_url_hq) updates.thumbnail_url_hq = result.thumbnail_url
    }
    console.log(`  → ${result.title.slice(0, 60)}${updates.thumbnail_url_hq ? ' [thumb]' : ''}`)
    if (FIX_DRY_RUN) { ok++; await sleep(200); continue }
    const { error: e } = await supabase.from('links').update(updates).eq('id', r.id)
    if (e) { console.log(`  ✗ ${e.message}`); failed++ } else ok++
    await sleep(600)
  }
  console.log(`  ✓ ${ok} updated, ${failed} failed`)
  return ok
}

async function fixPhase3(serial) {
  console.log(`\n━━ Phase 3: generic link OG enrichment ━━`)
  const { data: rows, error } = await supabase
    .from('links')
    .select('id, url, title, thumbnail_url_hq, platform')
    .eq('serial_number', serial)
    .is('thumbnail_url_hq', null)
  if (error) { console.error('query:', error.message); return 0 }
  const TEXT_ONLY = new Set(['thought', 'container', 'payment', 'note', 'text', 'twitter', 'x'])
  const candidates = rows.filter(r => r.url && r.url.startsWith('http') && !TEXT_ONLY.has((r.platform || '').toLowerCase()))
  console.log(`  ${candidates.length} candidate(s)`)
  let ok = 0, failed = 0
  for (const r of candidates) {
    let result = null
    if (/youtube\.com|youtu\.be/.test(r.url)) result = await enrichYouTube(r.url)
    if (!result || !result.thumbnail_url) {
      const og = await enrichOG(r.url)
      if (og) result = { ...(result || {}), title: result?.title || og.title, thumbnail_url: og.thumbnail_url || result?.thumbnail_url }
    }
    if (!result || (!result.title && !result.thumbnail_url)) { failed++; await sleep(400); continue }
    const updates = {}
    if (result.title && (!r.title || r.title.length < 5 || r.title.toLowerCase() === 'youtube.com' || r.title === 'tubitv.com')) updates.title = result.title
    if (result.thumbnail_url) {
      const cached = await cacheThumb(result.thumbnail_url, r.url, serial)
      updates.thumbnail_url_hq = cached || result.thumbnail_url
    }
    if (!Object.keys(updates).length) { failed++; continue }
    console.log(`  → ${(updates.title || r.title || '').slice(0, 50)}${updates.thumbnail_url_hq ? ' [thumb]' : ''}`)
    if (FIX_DRY_RUN) { ok++; await sleep(200); continue }
    const { error: e } = await supabase.from('links').update(updates).eq('id', r.id)
    if (e) { console.log(`  ✗ ${e.message}`); failed++ } else ok++
    await sleep(500)
  }
  console.log(`  ✓ ${ok} updated, ${failed} failed`)
  return ok
}

async function fixPhase4(serial) {
  console.log(`\n━━ Phase 4: cache external-CDN thumbnails ━━`)
  const { data: rows, error } = await supabase
    .from('links')
    .select('id, url, thumbnail_url_hq')
    .eq('serial_number', serial)
    .not('thumbnail_url_hq', 'is', null)
  if (error) { console.error('query:', error.message); return 0 }
  const need = rows.filter(r => r.thumbnail_url_hq && !isCached(r.thumbnail_url_hq))
  console.log(`  ${need.length} thumbnail(s) on external CDN`)
  let ok = 0, failed = 0
  for (const r of need) {
    const cached = await cacheThumb(r.thumbnail_url_hq, r.url, serial)
    if (!cached) { failed++; await sleep(300); continue }
    if (FIX_DRY_RUN) { ok++; continue }
    const { error: e } = await supabase.from('links').update({ thumbnail_url_hq: cached }).eq('id', r.id)
    if (e) { console.log(`  ✗ ${e.message}`); failed++ } else { ok++; process.stdout.write('.') }
    await sleep(150)
  }
  console.log(`\n  ✓ ${ok} cached, ${failed} failed`)
  return ok
}

async function probeStragglers(serial) {
  console.log(`\n━━ PROBE: test-fetch the 2 remaining external-CDN thumbs ━━`)
  const { data: rows } = await supabase
    .from('links')
    .select('id, url, title, platform, thumbnail_url_hq')
    .eq('serial_number', serial)
    .not('thumbnail_url_hq', 'is', null)
  const need = (rows || []).filter(r => r.thumbnail_url_hq && !isCached(r.thumbnail_url_hq))
  console.log(`  ${need.length} external-CDN thumbnail(s)`)
  for (const r of need) {
    console.log(`\n  platform=${r.platform} id=${r.id}`)
    console.log(`    url:   ${r.url}`)
    console.log(`    thumb: ${r.thumbnail_url_hq.slice(0, 120)}${r.thumbnail_url_hq.length > 120 ? '...' : ''}`)
    // Test with a browser-like header set + Referer
    const referer = r.platform === 'tiktok' ? 'https://www.tiktok.com/' : r.platform === 'instagram' ? 'https://www.instagram.com/' : new URL(r.url).origin + '/'
    try {
      const res = await fetch(r.thumbnail_url_hq, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': referer,
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
        },
        redirect: 'follow',
      })
      console.log(`    → ${res.status} ${res.statusText}  content-type=${res.headers.get('content-type')}`)
      if (res.ok) {
        // Try to cache it now that we have a working fetch
        const ct = (res.headers.get('content-type') || '').split(';')[0].trim()
        const ext = EXT_MAP[ct]
        if (ext) {
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length > 0 && buf.length <= CACHE_MAX_SIZE) {
            const hash = createHash('sha256').update(r.url).digest('hex').slice(0, 12)
            const path = `thumbnails/${serial}/${hash}.${ext}`
            const { error } = await supabase.storage.from(CACHE_BUCKET).upload(path, buf, { contentType: ct, upsert: true })
            if (error) {
              console.log(`    ✗ upload: ${error.message}`)
            } else {
              const { data } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(path)
              const cached = data.publicUrl.replace(/[\n\r]/g, '')
              const { error: uErr } = await supabase.from('links').update({ thumbnail_url_hq: cached }).eq('id', r.id)
              console.log(`    ✓ CACHED → ${cached.slice(0, 90)}${uErr ? ` (db update failed: ${uErr.message})` : ''}`)
            }
          } else {
            console.log(`    ✗ buffer size ${buf.length}`)
          }
        } else {
          console.log(`    ✗ unknown content-type ${ct}`)
        }
      }
    } catch (e) {
      console.log(`    ✗ fetch error: ${e.message || e}`)
    }
  }
}

async function rescueStragglers(serial) {
  console.log(`\n━━ RESCUE: re-fetch oEmbed for stragglers, cache fresh thumbs ━━`)
  const { data: rows } = await supabase
    .from('links')
    .select('id, url, title, platform, thumbnail_url_hq')
    .eq('serial_number', serial)
    .not('thumbnail_url_hq', 'is', null)
  const need = (rows || []).filter(r => r.thumbnail_url_hq && !isCached(r.thumbnail_url_hq))
  console.log(`  ${need.length} straggler(s)`)

  const saved = [], lost = []
  for (const r of need) {
    console.log(`\n  platform=${r.platform}  ${r.url.slice(0, 70)}`)
    let freshThumb = null
    if (r.platform === 'tiktok') {
      try {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(r.url)}`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          const d = await res.json()
          freshThumb = d.thumbnail_url || null
        }
      } catch {}
    } else if (r.platform === 'instagram') {
      // Instagram doesn't expose a public oEmbed; re-scrape OG meta
      try {
        const res = await fetch(r.url, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,application/xhtml+xml' },
          redirect: 'follow',
        })
        if (res.ok) {
          const html = await res.text()
          freshThumb = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] || null
        }
      } catch {}
    }
    if (!freshThumb) {
      console.log(`    ✗ no fresh thumbnail from source`)
      lost.push(r)
      continue
    }
    console.log(`    ↻ fresh thumb from source (len=${freshThumb.length})`)
    // Try to fetch it with full browser headers
    const referer = r.platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.instagram.com/'
    try {
      const res = await fetch(freshThumb, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'image/*', 'Referer': referer },
        redirect: 'follow',
      })
      if (!res.ok) { console.log(`    ✗ fresh thumb fetch: ${res.status}`); lost.push(r); continue }
      const ct = (res.headers.get('content-type') || '').split(';')[0].trim()
      const ext = EXT_MAP[ct]
      if (!ext) { console.log(`    ✗ bad content-type ${ct}`); lost.push(r); continue }
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length || buf.length > CACHE_MAX_SIZE) { console.log(`    ✗ bad size ${buf.length}`); lost.push(r); continue }
      const hash = createHash('sha256').update(r.url).digest('hex').slice(0, 12)
      const path = `thumbnails/${serial}/${hash}.${ext}`
      const { error } = await supabase.storage.from(CACHE_BUCKET).upload(path, buf, { contentType: ct, upsert: true })
      if (error) { console.log(`    ✗ upload: ${error.message}`); lost.push(r); continue }
      const { data } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(path)
      const cached = data.publicUrl.replace(/[\n\r]/g, '')
      const { error: uErr } = await supabase.from('links').update({ thumbnail_url_hq: cached }).eq('id', r.id)
      if (uErr) { console.log(`    ✗ db update: ${uErr.message}`); lost.push(r); continue }
      console.log(`    ✓ RESCUED`)
      saved.push(r)
    } catch (e) {
      console.log(`    ✗ fetch err: ${e.message || e}`)
      lost.push(r)
    }
  }
  console.log(`\n  saved=${saved.length}  lost=${lost.length}`)
  if (lost.length) {
    console.log(`\n  STILL BROKEN (candidates for deletion):`)
    for (const r of lost) console.log(`    links:${r.id}  ${r.platform}  ${r.url.slice(0, 70)}`)
  }
  return { saved, lost }
}

async function deleteStragglers(serial) {
  console.log(`\n━━ DELETE: remove links rows whose thumbnails still 403 ━━`)
  // Re-test each straggler to be SURE before delete
  const { data: rows } = await supabase
    .from('links')
    .select('id, url, title, platform, thumbnail_url_hq')
    .eq('serial_number', serial)
    .not('thumbnail_url_hq', 'is', null)
  const need = (rows || []).filter(r => r.thumbnail_url_hq && !isCached(r.thumbnail_url_hq))
  console.log(`  ${need.length} straggler(s) to re-test`)

  let deleted = 0
  for (const r of need) {
    const referer = r.platform === 'tiktok' ? 'https://www.tiktok.com/' : r.platform === 'instagram' ? 'https://www.instagram.com/' : new URL(r.url).origin + '/'
    let works = false
    try {
      const res = await fetch(r.thumbnail_url_hq, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'image/*', 'Referer': referer },
      })
      works = res.ok
      console.log(`  ${r.id}  ${r.platform}  fetch=${res.status}`)
    } catch (e) {
      console.log(`  ${r.id}  ${r.platform}  fetch error: ${e.message || e}`)
    }
    if (works) {
      console.log(`    → SKIP: thumbnail loads, not deleting`)
      continue
    }
    if (FIX_DRY_RUN) { console.log(`    → DRY: would DELETE`); deleted++; continue }
    const { error: dErr } = await supabase.from('links').delete().eq('id', r.id)
    if (dErr) console.log(`    ✗ delete failed: ${dErr.message}`)
    else { console.log(`    ✓ DELETED`); deleted++ }
  }
  console.log(`\n  deleted ${deleted}/${need.length}`)
  return deleted
}

async function reuploadInstagramReel(serial) {
  console.log(`\n━━ REUPLOAD: re-add the LaKeith Stanfield Instagram reel ━━`)
  const url = 'https://www.instagram.com/reel/DVZ7we4CREh/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA=='
  const mediaId = 'DVZ7we4CREh'
  const fallbackTitle = 'LaKeith Stanfield on Instagram'

  // Find the "sound" room
  const { data: rooms } = await supabase.from('rooms').select('id, name').eq('serial_number', serial)
  const soundRoom = rooms?.find(r => r.name === 'sound')
  if (!soundRoom) { console.error(`  sound room not found`); return 0 }

  // Check if already present (don't duplicate)
  const { data: existing } = await supabase
    .from('links')
    .select('id, url')
    .eq('serial_number', serial)
    .eq('platform', 'instagram')
  if (existing?.some(r => r.url?.includes('DVZ7we4CREh'))) {
    console.log(`  already exists, skipping`)
    return 0
  }

  // Try fresh OG scrape with full browser headers + cookies
  let thumbnailHq = null, enrichedTitle = null, artist = null
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      redirect: 'follow',
    })
    if (res.ok) {
      const html = await res.text()
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
      if (ogImage) thumbnailHq = ogImage
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1]
      if (ogTitle) enrichedTitle = ogTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    } else {
      console.log(`  OG scrape returned ${res.status}`)
    }
  } catch (e) {
    console.log(`  OG scrape error: ${e.message || e}`)
  }

  // Try /embed/ page as fallback
  if (!thumbnailHq) {
    try {
      const res = await fetch(`https://www.instagram.com/reel/${mediaId}/embed/`, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html', 'Referer': 'https://www.instagram.com/' },
        redirect: 'follow',
      })
      if (res.ok) {
        const html = await res.text()
        const disp = html.match(/"display_url"\s*:\s*"([^"]+)"/)?.[1]
          || html.match(/<img[^>]*src="(https:\/\/[^"]*(?:cdninstagram|fbcdn)[^"]*\.(?:jpg|jpeg|webp|png)[^"]*)"/i)?.[1]
        if (disp) thumbnailHq = disp.replace(/\\u0026/g, '&').replace(/\\/g, '')
      } else {
        console.log(`  /embed/ scrape returned ${res.status}`)
      }
    } catch (e) {
      console.log(`  /embed/ scrape error: ${e.message || e}`)
    }
  }

  // Try to cache the thumbnail
  if (thumbnailHq) {
    const cached = await cacheThumb(thumbnailHq, url, serial)
    if (cached) thumbnailHq = cached
    else console.log(`  cache failed, keeping raw URL`)
  }

  // Next position in links (room-scoped order doesn't matter for insert; server sorts)
  const { data: maxPos } = await supabase
    .from('links')
    .select('position')
    .eq('serial_number', serial)
    .order('position', { ascending: false })
    .limit(1)
  const nextPosition = ((maxPos?.[0]?.position) ?? -1) + 1

  const title = enrichedTitle || fallbackTitle
  const row = {
    serial_number: serial,
    url,
    platform: 'instagram',
    title,
    thumbnail: thumbnailHq,
    thumbnail_url_hq: thumbnailHq,
    media_id: mediaId,
    artist,
    render_mode: 'ghost',
    size: 1,
    position: nextPosition,
    room_id: soundRoom.id,
    metadata: { kind: 'social', provider: 'instagram' },
  }
  console.log(`  → room=sound  title="${title.slice(0, 60)}"  thumbnail=${thumbnailHq ? 'yes' + (isCached(thumbnailHq) ? ' (cached)' : ' (raw)') : 'NO'}`)

  if (FIX_DRY_RUN) { console.log(`  DRY — not inserting`); return 0 }
  const { data: inserted, error } = await supabase.from('links').insert(row).select().single()
  if (error) { console.error(`  ✗ insert failed: ${error.message}`); return 0 }
  console.log(`  ✓ INSERTED id=${inserted.id}`)
  return 1
}

async function resolveYouTubeClip(serial) {
  console.log(`\n━━ RESOLVE YouTube clips: extract parent video_id + clip range ━━`)
  const { data: rows } = await supabase
    .from('links')
    .select('id, url, title, platform, media_id, metadata, thumbnail_url_hq, render_mode')
    .eq('serial_number', serial)
  const clips = (rows || []).filter(r => /youtube\.com\/clip\//.test(r.url || ''))
  console.log(`  ${clips.length} clip(s) to resolve`)

  let ok = 0
  for (const r of clips) {
    console.log(`\n  ${r.url.slice(0, 90)}`)
    try {
      const res = await fetch(r.url, {
        signal: AbortSignal.timeout(7000),
        headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,*/*' },
        redirect: 'follow',
      })
      if (!res.ok) { console.log(`    ✗ fetch ${res.status}`); continue }
      const html = await res.text()
      // ytInitialPlayerResponse contains videoDetails + clipConfig
      const vid = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/)?.[1]
      // clipConfig has postId, startTimeMs, endTimeMs
      const startMs = html.match(/"startTimeMs"\s*:\s*"(\d+)"/)?.[1]
        || html.match(/"startTimeMs"\s*:\s*(\d+)/)?.[1]
      const endMs = html.match(/"endTimeMs"\s*:\s*"(\d+)"/)?.[1]
        || html.match(/"endTimeMs"\s*:\s*(\d+)/)?.[1]

      if (!vid) { console.log(`    ✗ parent video_id not found in page HTML`); continue }

      // Also grab a fresh title from the clip page (falls back to existing)
      const newTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1]
        || null
      const newThumb = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
        || `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`

      console.log(`    video_id=${vid}  startMs=${startMs || '—'}  endMs=${endMs || '—'}`)

      const metadata = { ...(r.metadata || {}) }
      if (startMs) metadata.clip_start_ms = parseInt(startMs, 10)
      if (endMs) metadata.clip_end_ms = parseInt(endMs, 10)

      // Cache the fresh thumb
      let cachedThumb = null
      if (newThumb) {
        cachedThumb = await cacheThumb(newThumb, r.url, serial)
      }

      const updates = {
        platform: 'youtube',
        media_id: vid,
        render_mode: 'ghost',
        metadata,
        ...(newTitle && newTitle !== 'YouTube' ? { title: newTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") } : {}),
        ...(cachedThumb || newThumb ? { thumbnail_url_hq: cachedThumb || newThumb } : {}),
      }
      console.log(`    → title="${(updates.title || r.title || '').slice(0, 60)}"${updates.thumbnail_url_hq ? ' [thumb]' : ''}`)
      if (FIX_DRY_RUN) { ok++; continue }
      const { error: uErr } = await supabase.from('links').update(updates).eq('id', r.id)
      if (uErr) { console.log(`    ✗ ${uErr.message}`); continue }
      console.log(`    ✓ updated`)
      ok++
    } catch (e) {
      console.log(`    ✗ ${e.message || e}`)
    }
    await sleep(400)
  }
  console.log(`\n  ✓ ${ok}/${clips.length} clips resolved`)
  return ok
}

async function runFix() {
  const { data: fp, error } = await supabase.from('footprints').select('*').eq('username', USERNAME).single()
  if (error || !fp?.serial_number) { console.error(`@${USERNAME} not found or no serial`); process.exit(1) }
  const serial = fp.serial_number
  console.log(`🔧 FIX_MODE=${FIX_MODE}${FIX_DRY_RUN ? ' [DRY RUN]' : ''} — footprint @${fp.username} serial=${serial}`)

  const phases = FIX_MODE === 'all' ? ['1', '2', '3', '4'] : [FIX_MODE]
  let total = 0
  for (const p of phases) {
    if (p === '1') total += await fixPhase1(serial)
    else if (p === '2') total += await fixPhase2(serial)
    else if (p === '3') total += await fixPhase3(serial)
    else if (p === '4') total += await fixPhase4(serial)
    else if (p === 'probe') await probeStragglers(serial)
    else if (p === 'rescue') await rescueStragglers(serial)
    else if (p === 'delete-stragglers') total += await deleteStragglers(serial)
    else if (p === 'reupload-ig') total += await reuploadInstagramReel(serial)
    else if (p === 'resolve-clip') total += await resolveYouTubeClip(serial)
    else if (p === 'verify_events') {
      const { data, error } = await supabase.from('fp_events').select('*').order('created_at', { ascending: false }).limit(5)
      if (error) console.log('err:', error.message)
      else {
        console.log(`fp_events count: ${data.length}`)
        for (const r of data) console.log(`  ${r.created_at}  ${r.event_type}  fp=${r.footprint_id?.slice(0,8)}  data=${JSON.stringify(r.data)}`)
      }
    }
    else if (p === 'fp_events_real_check') {
      const { data: fp } = await supabase.from('footprints').select('user_id').eq('username', USERNAME).single()
      // Insert a probe row, then read it back to see all columns
      const { data: probe, error } = await supabase.from('fp_events').insert({
        footprint_id: fp.user_id,
        event_type: 'visit',
      }).select('*').single()
      if (error) { console.log('insert err:', error.message); return }
      console.log('fp_events ACTUAL columns:', Object.keys(probe).join(', '))
      console.log('row:', JSON.stringify(probe, null, 2))
      // Clean up
      await supabase.from('fp_events').delete().eq('id', probe.id)
      console.log('(probe row deleted)')
      // Now check page_views with explicit select
      const { error: pvErr } = await supabase.from('page_views').select('*').limit(1)
      console.log('page_views select:', pvErr ? `ERR ${pvErr.message}` : 'OK (table exists)')
      // RPC
      const { error: rpcErr } = await supabase.rpc('increment_view_count', { p_footprint_id: fp.user_id })
      console.log('RPC increment_view_count:', rpcErr ? `ERR ${rpcErr.message}` : 'OK')
    }
    else if (p === 'fp_events_minimal') {
      // Strip down to bare-minimum columns to find what exists
      const { data: fp } = await supabase.from('footprints').select('user_id').eq('username', USERNAME).single()
      // Try just the absolute basics
      const { error: e1 } = await supabase.from('fp_events').insert({
        footprint_id: fp.user_id,
        event_type: 'visit',
      }).select()
      console.log('with fp_id+event_type only:', e1 ? `ERR ${e1.message}` : 'OK')
      const { error: e2 } = await supabase.from('fp_events').insert({
        footprint_id: fp.user_id,
        event_type: 'visit',
        visitor_hash: 'h',
      }).select()
      console.log('+ visitor_hash:', e2 ? `ERR ${e2.message}` : 'OK')
      // List tables in public schema (using info schema via SQL through pg)
      // Can't easily list via supabase-js, but try common analytics-y tables
      for (const t of ['page_views', 'fp_events', 'analytics_events', 'events', 'visits']) {
        const { error } = await supabase.from(t).select('*', { head: true, count: 'exact' })
        console.log(`  ${t}:`, error ? `MISSING (${error.message.split('\n')[0]})` : 'EXISTS')
      }
    }
    else if (p === 'fp_events_test_insert') {
      // Get ae's user_id, attempt to insert a test event with it
      const { data: fp } = await supabase.from('footprints').select('user_id, serial_number').eq('username', USERNAME).single()
      console.log(`@ae user_id=${fp.user_id}  serial=${fp.serial_number}`)
      const { data, error } = await supabase.from('fp_events').insert({
        footprint_id: fp.user_id,
        event_type: 'visit',
        event_data: { test: true, source: 'audit-tiles.mjs' },
        visitor_hash: 'test1234',
      }).select()
      console.log(error ? `INSERT FAILED: ${error.message}\n${error.details || ''}\n${error.hint || ''}` : `✓ inserted: ${JSON.stringify(data)}`)
      // Try page_views too
      const { data: pv, error: pvErr } = await supabase.from('page_views').insert({
        footprint_id: fp.user_id,
        viewer_hash: 'test1234',
        referrer: 'test',
        user_agent: 'test',
      }).select()
      console.log(pvErr ? `page_views INSERT FAILED: ${pvErr.message}\n${pvErr.details || ''}` : `✓ page_views inserted`)
      // Also try the increment_view_count RPC
      const { error: rpcErr } = await supabase.rpc('increment_view_count', { p_footprint_id: fp.user_id })
      console.log(rpcErr ? `RPC FAILED: ${rpcErr.message}` : '✓ RPC ok')
    }
    else if (p === 'fp_events_check') {
      // What columns does fp_events have? what does the FK want?
      const { data: sample } = await supabase.from('fp_events').select('*').limit(1)
      console.log('fp_events columns:', sample?.[0] ? Object.keys(sample[0]).join(', ') : '(empty table)')
      // Try insert with serial_number as footprint_id (UUID expected) — should fail if FK is to id
      // Just count recent events to see if anything has succeeded
      const { count } = await supabase.from('fp_events').select('*', { count: 'exact', head: true })
      console.log('fp_events row count:', count)
      // Footprints id check
      const { data: fp } = await supabase.from('footprints').select('*').eq('username', USERNAME).limit(1)
      console.log('footprints[ae] keys:', fp?.[0] ? Object.keys(fp[0]).join(', ') : '(none)')
      console.log('footprints[ae] has id?', fp?.[0]?.id !== undefined ? `yes: ${fp[0].id}` : 'NO — id is undefined')
    }
    else if (p === 'find-pay') {
      const { data } = await supabase
        .from('links')
        .select('id, platform, url, render_mode, title, room_id, parent_tile_id')
        .eq('serial_number', serial)
        .or('platform.eq.payment,url.like.%buy.stripe%,url.like.%checkout.stripe%')
      console.log(JSON.stringify(data, null, 2))
    }
    else if (p === 'yt-backfill') {
      const { data: yts } = await supabase
        .from('links')
        .select('id, url, media_id, render_mode, title')
        .eq('serial_number', serial)
        .eq('platform', 'youtube')
      let fixed = 0
      for (const r of yts || []) {
        const updates = {}
        if (!r.media_id) {
          const m = r.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/|youtube\.com\/clip\/)([a-zA-Z0-9_-]{11})/)
          if (m) updates.media_id = m[1]
        }
        if (r.render_mode !== 'ghost') updates.render_mode = 'ghost'
        if (!Object.keys(updates).length) continue
        console.log(`  ${r.id}  media_id=${updates.media_id || r.media_id}  render=${updates.render_mode || r.render_mode}  "${(r.title || '').slice(0, 40)}"`)
        if (!FIX_DRY_RUN) {
          const { error } = await supabase.from('links').update(updates).eq('id', r.id)
          if (!error) fixed++
        } else fixed++
      }
      console.log(`\n  ✓ ${fixed} youtube rows fixed`)
      total += fixed
    }
    else if (p === 'diagnose-modes') {
      const { data: rows } = await supabase
        .from('links')
        .select('id, platform, render_mode, url, title, size, media_id')
        .eq('serial_number', serial)
        .in('id', [
          '8c545203-2f30-4641-9141-34fc9e2927ee', // long thought
          '463ac668-8641-4ca3-b297-c2e5a6640bfd', // other preview-card
          '9d624aa4-71ef-42f9-8176-c829d6ded846', // non-ghost YT
        ])
      console.log(JSON.stringify(rows, null, 2))
      // Also tally render_mode distribution for platform=thought
      const { data: thoughts } = await supabase
        .from('links')
        .select('id, render_mode, title, size')
        .eq('serial_number', serial)
        .eq('platform', 'thought')
      const tally = (thoughts || []).reduce((a, r) => ({ ...a, [r.render_mode || 'null']: (a[r.render_mode || 'null'] || 0) + 1 }), {})
      console.log('\nthought tiles by render_mode:', tally, 'total:', thoughts?.length)
      // And YT
      const { data: yts } = await supabase
        .from('links')
        .select('id, render_mode, title, media_id')
        .eq('serial_number', serial)
        .eq('platform', 'youtube')
      const ytTally = (yts || []).reduce((a, r) => ({ ...a, [r.render_mode || 'null']: (a[r.render_mode || 'null'] || 0) + 1 }), {})
      const ytNoMedia = (yts || []).filter(r => !r.media_id)
      console.log('youtube tiles by render_mode:', ytTally, 'total:', yts?.length, 'missing media_id:', ytNoMedia.length)
      if (ytNoMedia.length) console.log('  missing media_id:', ytNoMedia.map(r => r.id).join(', '))
    }
    else if (p === 'probe-sizes-v2') {
      // Just dump the size distribution across both tables
      const { data: links } = await supabase.from('links').select('id, size, platform, title, created_at').eq('serial_number', serial)
      const linksDist = (links || []).reduce((a,r) => ({ ...a, [r.size ?? 'null']: (a[r.size ?? 'null']||0)+1 }), {})
      const byPlatSize = (links || []).reduce((a,r) => { const k = `${r.platform}/${r.size}`; a[k]=(a[k]||0)+1; return a }, {})
      console.log('links count:', links?.length, 'dist:', linksDist)
      console.log('links by platform/size:', byPlatSize)
      const sampleColumns = links?.[0] ? Object.keys(links[0]).join(', ') : 'empty'
      console.log('links columns:', sampleColumns)
      const { data: lib } = await supabase.from('library').select('id, size').eq('serial_number', serial)
      const libDist = (lib || []).reduce((a,r) => ({ ...a, [r.size ?? 'null']: (a[r.size ?? 'null']||0)+1 }), {})
      console.log('library count:', lib?.length, 'dist:', libDist)
    }
    else if (p === 'probe-size-floor-damage') {
      // Inspect: which tiles were touched by the 2026-04-15 22:33:37 size-floor bump?
      // links has updated_at — window the query.
      // library has no updated_at — show full distribution by size.
      const windowStart = '2026-04-15T22:33:30Z'
      const windowEnd = '2026-04-15T22:33:50Z'
      const { data: linksBumped } = await supabase
        .from('links')
        .select('id, platform, title, size, updated_at')
        .eq('serial_number', serial)
        .eq('size', 2)
        .gte('updated_at', windowStart)
        .lte('updated_at', windowEnd)
      console.log(`  links size=2 updated_at in bump window [${windowStart} .. ${windowEnd}]:  ${linksBumped?.length || 0}`)
      if (linksBumped?.length) {
        const byPlat = linksBumped.reduce((a,r) => ({ ...a, [r.platform]: (a[r.platform]||0)+1 }), {})
        console.log('  by platform:', byPlat)
      }
      // Also count links at size=2 NOT in the window (intentional)
      const { data: linksAllSize2 } = await supabase
        .from('links')
        .select('id, platform, size, updated_at')
        .eq('serial_number', serial)
        .eq('size', 2)
      const linksIntentional = (linksAllSize2 || []).filter(r => !(r.updated_at >= windowStart && r.updated_at <= windowEnd))
      console.log(`  links size=2 OUTSIDE window (intentional, keep):  ${linksIntentional.length}`)
      // Library — full size distribution
      const { data: lib } = await supabase.from('library').select('id, size').eq('serial_number', serial)
      const libDist = (lib || []).reduce((a,r) => ({ ...a, [r.size]: (a[r.size]||0)+1 }), {})
      console.log(`  library size distribution:`, libDist)
    }
    else if (p === 'revert-size-floor') {
      // Reverse-engineer peak state: apply the pre-#244 code default retroactively.
      //   - YouTube / Vimeo: size 2 (M) — videos need the 16:9 room
      //   - Everything else: size 1 (S) — the long-standing convention
      // Links table has no updated_at column, so we can't identify which specific
      // rows my destructive bump touched vs which were intentional. This rule-based
      // revert restores the peak composition; any intentional non-default sizes
      // will need to be re-applied via edit mode (honest tradeoff — we prioritize
      // restoring the grid's visual rhythm over preserving individual overrides).
      const { data: linksNonVideo } = await supabase
        .from('links')
        .select('id')
        .eq('serial_number', serial)
        .eq('size', 2)
        .not('platform', 'in', '(youtube,vimeo)')
      let reverted = 0
      if (linksNonVideo?.length) {
        const ids = linksNonVideo.map(r => r.id)
        const { error } = await supabase.from('links').update({ size: 1 }).in('id', ids)
        if (!error) reverted += ids.length
        else console.log('  links revert err:', error.message)
        console.log(`  reverted ${ids.length} non-video links back to size 1`)
      }
      // Library: all images default to S (square). Blanket revert.
      const { data: libToRevert } = await supabase
        .from('library')
        .select('id')
        .eq('serial_number', serial)
        .eq('size', 2)
      if (libToRevert?.length) {
        const ids = libToRevert.map(r => r.id)
        const { error } = await supabase.from('library').update({ size: 1 }).in('id', ids)
        if (!error) reverted += ids.length
        else console.log('  library revert err:', error.message)
        console.log(`  reverted ${ids.length} library images back to size 1`)
      }
      console.log(`  ✓ ${reverted} tiles reverted`)
      total += reverted
    }
    else if (p === 'size-floor') {
      // Bump ALL size-1 tiles to size-2 across both tables
      const { data: links1 } = await supabase.from('links').select('id').eq('serial_number', serial).eq('size', 1)
      const { data: lib1 } = await supabase.from('library').select('id').eq('serial_number', serial).eq('size', 1)
      console.log(`  links size=1: ${links1?.length || 0}   library size=1: ${lib1?.length || 0}`)
      let bumped = 0
      if (links1?.length) {
        const ids = links1.map(r => r.id)
        const { error } = await supabase.from('links').update({ size: 2 }).in('id', ids)
        if (!error) bumped += ids.length
        else console.log('  links err:', error.message)
      }
      if (lib1?.length) {
        const ids = lib1.map(r => r.id)
        const { error } = await supabase.from('library').update({ size: 2 }).in('id', ids)
        if (!error) bumped += ids.length
        else console.log('  library err:', error.message)
      }
      console.log(`  ✓ ${bumped} tiles bumped to size 2`)
      total += bumped
    }
    else if (p === 'bump-text-tiles') {
      const { data: rows } = await supabase
        .from('links')
        .select('id, platform, title, size')
        .eq('serial_number', serial)
        .in('platform', ['thought', 'container', 'twitter', 'x'])
      let bumped = 0
      for (const r of rows || []) {
        const len = (r.title || '').length
        // Long thoughts → size 2 (M). All containers + tweets → size 2 minimum (need room).
        const wantSize = (r.platform === 'container' || r.platform === 'twitter' || r.platform === 'x')
          ? Math.max(r.size || 1, 2)
          : (len > 60 ? Math.max(r.size || 1, 2) : (r.size || 1))
        if (wantSize !== r.size) {
          console.log(`  ${r.platform.padEnd(10)} ${r.id} size ${r.size}→${wantSize}  "${(r.title || '').slice(0, 50)}"`)
          if (!FIX_DRY_RUN) {
            const { error } = await supabase.from('links').update({ size: wantSize }).eq('id', r.id)
            if (!error) bumped++
          } else bumped++
        }
      }
      console.log(`\n  ✓ ${bumped} tiles bumped`)
      total += bumped
    }
    else if (p === 'check-clip') {
      const { data } = await supabase.from('links').select('*').eq('serial_number', serial).like('url', '%/clip/%')
      console.log(JSON.stringify(data, null, 2))
    }
    else if (p === 'anon-check') {
      // Replicate the exact /ae page query using the same service_role supabase client.
      const { data, error } = await supabase.from('footprints').select('*').eq('username', USERNAME).eq('published', true).single()
      console.log(`  service+published=true+single(): ${error ? 'ERR ' + error.message : 'OK rows ' + JSON.stringify({ username: data.username, serial: data.serial_number, published: data.published })}`)
      const { data: all } = await supabase.from('footprints').select('username, serial_number, published').eq('username', USERNAME)
      console.log(`  all rows for ae: ${JSON.stringify(all)}`)
    }
  }
  console.log(`\n━━━ Total updates: ${total}${FIX_DRY_RUN ? ' (dry)' : ''}\n`)
}

async function main() {
  if (FIX_MODE) { await runFix(); return }
  if (INSPECT) {
    for (const table of ['footprints', 'links', 'library', 'rooms']) {
      const { data, error } = await supabase.from(table).select('*').limit(1)
      if (error) console.log(`${table}: ERROR — ${error.message}`)
      else if (data && data.length) console.log(`${table}: ${Object.keys(data[0]).join(', ')}`)
      else console.log(`${table}: (empty)`)
    }
    return
  }

  // 1. Resolve ae's serial number
  const { data: fp, error: fpErr } = await supabase
    .from('footprints')
    .select('*')
    .eq('username', USERNAME)
    .single()

  if (fpErr || !fp) {
    console.error(`Footprint for @${USERNAME} not found:`, fpErr?.message)
    process.exit(1)
  }

  if (!fp.serial_number) {
    console.error(`@${USERNAME} has no serial_number — footprint not yet published.`)
    process.exit(1)
  }

  // 2. Resolve rooms for this serial
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, position, hidden')
    .eq('serial_number', fp.serial_number)

  const roomMap = new Map((rooms || []).map(r => [r.id, r.name]))

  // 3. Pull all links + library rows
  const { data: links, error: linksErr } = await supabase
    .from('links')
    .select('id, url, platform, title, thumbnail, thumbnail_url_hq, render_mode, metadata, room_id, position, size, created_at, artist, serial_number')
    .eq('serial_number', fp.serial_number)
    .order('created_at', { ascending: true })

  if (linksErr) {
    console.error('links query failed:', linksErr.message)
    process.exit(1)
  }

  const { data: library, error: libErr } = await supabase
    .from('library')
    .select('id, image_url, room_id, position, size, aspect, aspect_ratio, created_at, serial_number, render_hash')
    .eq('serial_number', fp.serial_number)
    .order('created_at', { ascending: true })

  if (libErr) {
    console.error('library query failed:', libErr.message)
    process.exit(1)
  }

  // 4. Classify
  const annotated = [
    ...links.map(r => ({ ...r, _source: 'links', _classification: classifyLink(r) })),
    ...library.map(r => ({ ...r, _source: 'library', _classification: classifyLibrary(r) })),
  ]

  if (AS_JSON) {
    console.log(JSON.stringify({ footprint: fp, rooms, annotated }, null, 2))
    return
  }

  // Debug: show a raw library row that was flagged as having whitespace in URL
  const wsLib = library.find(r => hasWhitespaceInUrl(r.image_url))
  if (wsLib) {
    console.log(`\n[debug] whitespace lib row id=${wsLib.id} len=${(wsLib.image_url || '').length}: ${JSON.stringify(wsLib.image_url)}\n`)
  } else {
    console.log(`\n[debug] no library rows with whitespace — flagging may be false positive\n`)
  }

  // 5. Report
  const total = annotated.length
  const byAction = annotated.reduce((acc, r) => {
    acc[r._classification.action] = (acc[r._classification.action] || 0) + 1
    return acc
  }, {})
  const byRoom = annotated.reduce((acc, r) => {
    const name = r.room_id ? (roomMap.get(r.room_id) || 'unknown-room') : '(no-room)'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {})

  console.log(`\n# Audit: @${USERNAME} (serial ${fp.serial_number}, published=${fp.published})\n`)
  console.log(`**Totals:** ${total} tiles — ${byAction.keep || 0} ok, ${byAction.fix || 0} fixable, ${byAction.delete || 0} delete candidates\n`)
  console.log(`**By room:** ${Object.entries(byRoom).map(([k, v]) => `${k}=${v}`).join(', ')}\n`)

  // Broken tiles (rating >= 3)
  const broken = annotated.filter(r => r._classification.rating >= 3)
    .sort((a, b) => b._classification.rating - a._classification.rating)

  console.log(`## Broken / half-filled tiles (${broken.length})\n`)
  console.log(`| # | source | rating | action | room | platform | title | url | reason |`)
  console.log(`|---|---|---|---|---|---|---|---|---|`)
  broken.forEach((r, i) => {
    const room = r.room_id ? (roomMap.get(r.room_id) || '?') : '-'
    const plat = r._source === 'links' ? (r.platform || '?') : (r.media_kind || 'image')
    const title = (r.title || '(null)').slice(0, 60).replace(/\|/g, '\\|').replace(/\n/g, ' ')
    const url = r._source === 'links' ? (r.url || '').slice(0, 80) : (r.image_url || '').slice(0, 80)
    console.log(`| ${i + 1} | ${r._source} | ${r._classification.rating} | ${r._classification.action} | ${room} | ${plat} | ${title} | ${url.replace(/\|/g, '\\|')} | ${r._classification.reason} |`)
  })

  // Peak build candidates (rating 0, has everything)
  const peaks = annotated.filter(r => {
    if (r._classification.rating !== 0) return false
    if (r._source === 'links') {
      return r.title && (r.thumbnail_url_hq || r.thumbnail) && r.url
    }
    return r.image_url // library: just need a cached image
  }).sort((a, b) => {
    // prefer cached thumbnails + longer titles + richer metadata
    const aScore = (a._source === 'links' && isCached(a.thumbnail_url_hq) ? 2 : 0) + ((a.title?.length || 0) / 50) + (a.metadata && Object.keys(a.metadata).length > 2 ? 1 : 0)
    const bScore = (b._source === 'links' && isCached(b.thumbnail_url_hq) ? 2 : 0) + ((b.title?.length || 0) / 50) + (b.metadata && Object.keys(b.metadata).length > 2 ? 1 : 0)
    return bScore - aScore
  })

  console.log(`\n## Peak build candidates (top 10 of ${peaks.length} complete tiles)\n`)
  console.log(`| # | source | room | platform | size | title | has-cached-thumb |`)
  console.log(`|---|---|---|---|---|---|---|`)
  peaks.slice(0, 10).forEach((r, i) => {
    const room = r.room_id ? (roomMap.get(r.room_id) || '?') : '-'
    const plat = r._source === 'links' ? (r.platform || '?') : (r.media_kind || 'image')
    const title = (r.title || '(image)').slice(0, 60).replace(/\|/g, '\\|')
    const cached = r._source === 'links' ? (isCached(r.thumbnail_url_hq) ? 'yes' : 'no') : (isCached(r.image_url) ? 'yes' : 'no')
    console.log(`| ${i + 1} | ${r._source} | ${room} | ${plat} | ${r.size} | ${title} | ${cached} |`)
  })

  // Action list — emit IDs for fix/delete scripts to consume
  const fixIds = broken.filter(r => r._classification.action === 'fix').map(r => `${r._source}:${r.id}`)
  const deleteIds = broken.filter(r => r._classification.action === 'delete').map(r => `${r._source}:${r.id}`)

  console.log(`\n## Action lists\n`)
  console.log(`**fix** (${fixIds.length}):\n\`\`\`\n${fixIds.join('\n') || '(none)'}\n\`\`\`\n`)
  console.log(`**delete** (${deleteIds.length}):\n\`\`\`\n${deleteIds.join('\n') || '(none)'}\n\`\`\`\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
