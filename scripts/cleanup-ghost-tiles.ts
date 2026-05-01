#!/usr/bin/env npx tsx
/**
 * Cleanup ghost tiles — DB rows with Supabase Storage URLs pointing to deleted files.
 *
 * Usage:
 *   npx tsx scripts/cleanup-ghost-tiles.ts --slug ae --dry-run
 *   npx tsx scripts/cleanup-ghost-tiles.ts --slug ae --execute
 *
 * Only HEAD-checks Supabase Storage URLs belonging to this project.
 * External URLs (provider thumbnails, CDN images, etc.) are never tested or deleted.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Run with: npx tsx --env-file=.env.local scripts/cleanup-ghost-tiles.ts --slug ae --dry-run')
  process.exit(1)
}

const args = process.argv.slice(2)
const slugIdx = args.indexOf('--slug')
const slug = slugIdx !== -1 ? args[slugIdx + 1] : null
const execute = args.includes('--execute')
const dryRun = !execute

if (!slug) {
  console.error('Usage: --slug <username> [--dry-run | --execute]')
  process.exit(1)
}

const SUPABASE_STORAGE_MARKER = 'supabase.co/storage/v1/'

function isSupabaseStorageUrl(url: string): boolean {
  return url.includes(SUPABASE_STORAGE_MARKER)
}

function toObjectUrl(url: string): string {
  return url
    .replace('/render/image/public/', '/object/public/')
    .replace(/\?width=\d+&quality=\d+$/, '')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function checkUrl(url: string): Promise<{ status: number; ok: boolean }> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    return { status: res.status, ok: res.ok }
  } catch {
    return { status: 0, ok: false }
  }
}

async function main() {
  console.log(`\n🔍 Ghost tile cleanup for /${slug}`)
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no deletions)' : '⚠️  EXECUTE (will delete)'}\n`)

  const { data: footprint } = await supabase
    .from('footprints')
    .select('serial_number, username')
    .eq('username', slug)
    .single()

  if (!footprint?.serial_number) {
    console.error(`No footprint found for slug "${slug}"`)
    process.exit(1)
  }

  const serial = footprint.serial_number
  console.log(`   Serial: ${serial}\n`)

  const [libRes, linksRes] = await Promise.all([
    supabase.from('library').select('id, image_url, position, room_id').eq('serial_number', serial).is('parent_tile_id', null).limit(2000),
    supabase.from('links').select('id, url, platform, position, room_id, thumbnail_url_hq').eq('serial_number', serial).is('parent_tile_id', null).limit(2000),
  ])

  const libraryRows = (libRes.data || []) as { id: string; image_url: string; position: number; room_id: string | null }[]
  const linksRows = (linksRes.data || []) as { id: string; url: string; platform: string; position: number; room_id: string | null; thumbnail_url_hq: string | null }[]

  console.log(`   Library rows: ${libraryRows.length}`)
  console.log(`   Links rows:   ${linksRows.length}\n`)

  const ghosts: { table: string; id: string; url: string; status: number }[] = []

  // Check library rows (image_url)
  const supabaseLibRows = libraryRows.filter(r => isSupabaseStorageUrl(r.image_url))
  console.log(`   Library rows with Supabase Storage URLs: ${supabaseLibRows.length}`)
  const skippedLib = libraryRows.length - supabaseLibRows.length
  if (skippedLib > 0) console.log(`   Library rows with external URLs (skipped): ${skippedLib}`)

  for (const row of supabaseLibRows) {
    const checkUrlStr = toObjectUrl(row.image_url)
    const result = await checkUrl(checkUrlStr)
    if (!result.ok) {
      ghosts.push({ table: 'library', id: row.id, url: row.image_url, status: result.status })
      console.log(`   ❌ GHOST library/${row.id}  status=${result.status}  pos=${row.position}`)
    }
  }

  // Check links rows — only test Supabase Storage URLs (url or thumbnail_url_hq)
  const supabaseLinkRows = linksRows.filter(r => isSupabaseStorageUrl(r.url))
  console.log(`\n   Links rows with Supabase Storage URLs: ${supabaseLinkRows.length}`)
  const skippedLinks = linksRows.length - supabaseLinkRows.length
  if (skippedLinks > 0) console.log(`   Links rows with external URLs (skipped): ${skippedLinks}`)

  for (const row of supabaseLinkRows) {
    const checkUrlStr = toObjectUrl(row.url)
    const result = await checkUrl(checkUrlStr)
    if (!result.ok) {
      ghosts.push({ table: 'links', id: row.id, url: row.url, status: result.status })
      console.log(`   ❌ GHOST links/${row.id}  platform=${row.platform}  status=${result.status}  pos=${row.position}`)
    }
  }

  console.log(`\n📊 Summary: ${ghosts.length} ghost tile(s) found\n`)

  if (ghosts.length === 0) {
    console.log('   No ghost tiles. Nothing to clean up.')
    return
  }

  if (dryRun) {
    console.log('   DRY RUN — no deletions performed.')
    console.log('   Run with --execute to delete these rows.\n')
    for (const g of ghosts) {
      console.log(`   ${g.table}/${g.id}  status=${g.status}  url=${g.url.slice(0, 80)}...`)
    }
    return
  }

  // Execute mode — delete ghost rows
  console.log('   Deleting ghost rows...\n')
  let deleted = 0
  for (const g of ghosts) {
    const { error } = await supabase.from(g.table).delete().eq('id', g.id).eq('serial_number', serial)
    if (error) {
      console.error(`   ⚠️  Failed to delete ${g.table}/${g.id}: ${error.message}`)
    } else {
      console.log(`   🗑  Deleted ${g.table}/${g.id}`)
      deleted++
    }
  }

  console.log(`\n✅ Deleted ${deleted}/${ghosts.length} ghost tile(s).\n`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
