#!/usr/bin/env node
/**
 * Backfill stored preview metadata for existing ordinary external links.
 *
 * Usage:
 *   node scripts/backfill-link-previews.mjs ae
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { require as tsxRequire } from 'tsx/cjs/api'

function loadDotEnvLocal() {
  const file = resolvePath(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function cleanString(value, maxLength) {
  if (!value) return null
  const cleaned = String(value).replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function domainFor(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function logValue(value) {
  return value || 'null'
}

loadDotEnvLocal()

const slug = process.argv[2] || 'ae'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const { fetchLinkPreview } = tsxRequire('../lib/og.ts', import.meta.url)
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SKIP_PLATFORMS = new Set([
  'youtube',
  'spotify',
  'apple_music',
  'soundcloud',
  'bandcamp',
  'vimeo',
  'video',
  'instagram',
  'tiktok',
])

const { data: footprint, error: fpError } = await supabase
  .from('footprints')
  .select('username, serial_number')
  .eq('username', slug)
  .maybeSingle()

if (fpError || !footprint?.serial_number) {
  console.error(`Footprint not found for slug "${slug}"`, fpError?.message || '')
  process.exit(1)
}

const { data: rows, error: linksError } = await supabase
  .from('links')
  .select('id, url, platform, title, thumbnail, metadata, position')
  .eq('serial_number', footprint.serial_number)
  .not('url', 'is', null)
  .order('position', { ascending: true })

if (linksError) {
  console.error(`Failed to load links: ${linksError.message}`)
  process.exit(1)
}

const links = (rows || []).filter((row) => isHttpUrl(row.url) && !SKIP_PLATFORMS.has(row.platform))
console.log(`Backfilling ${links.length} ordinary external link previews for /${slug}`)

for (const row of links) {
  const oldDomain = row.metadata?.domain || domainFor(row.url)
  const oldDescription = row.metadata?.description || null
  console.log(`\n${row.url}`)
  console.log(`  old title:  ${logValue(row.title)}`)
  console.log(`  old desc:   ${logValue(oldDescription)}`)
  console.log(`  old image:  ${logValue(row.thumbnail)}`)
  console.log(`  old domain: ${logValue(oldDomain)}`)

  const preview = await fetchLinkPreview(row.url, { timeoutMs: 4500 })
  const domain = domainFor(row.url)
  const metadata = {
    ...(row.metadata || {}),
    description: cleanString(preview?.description, 320) || row.metadata?.description || null,
    canonical_url: cleanString(preview?.canonical, 2048) || row.metadata?.canonical_url || null,
    site_name: cleanString(preview?.siteName, 120) || row.metadata?.site_name || null,
    domain,
  }
  const updates = {
    title: cleanString(preview?.title, 180) || row.title || domain,
    thumbnail: cleanString(preview?.image, 2048) || row.thumbnail || null,
    metadata,
  }

  const { error: updateError } = await supabase
    .from('links')
    .update(updates)
    .eq('id', row.id)

  console.log(`  new title:  ${logValue(updates.title)}`)
  console.log(`  new desc:   ${logValue(metadata.description)}`)
  console.log(`  new image:  ${logValue(updates.thumbnail)}`)
  console.log(`  new domain: ${logValue(metadata.domain)}`)
  console.log(updateError ? `  failure: ${updateError.message}` : '  success')
}
