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

function yesNo(value) {
  return value ? 'yes' : 'no'
}

function hardPlatformFor(row) {
  const url = row.url || ''
  const platform = row.platform || ''
  if (platform === 'twitter' || platform === 'x' || /(?:twitter\.com|x\.com)/i.test(url)) return 'X'
  if (platform === 'instagram' || /instagram\.com/i.test(url)) return 'Instagram'
  if (platform === 'tiktok' || /tiktok\.com/i.test(url)) return 'TikTok'
  return null
}

loadDotEnvLocal()

const slug = process.argv[2] || 'ae'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const { resolveSourceExcerpt, buildSourceExcerptPayload } = tsxRequire('../lib/source-excerpts.ts', import.meta.url)
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

const summary = {
  product: 0,
  feed: 0,
  article: 0,
  generic: 0,
  withProductImage: 0,
  withProductPrice: 0,
  productDomains: new Map(),
  productDetails: [],
  fallback: 0,
  failed: 0,
  feedSources: 0,
  feedItems: 0,
  sourceKinds: new Map(),
  hardPlatforms: {
    X: { total: 0, improved: 0, fallback: 0, reasons: new Set() },
    Instagram: { total: 0, improved: 0, fallback: 0, reasons: new Set() },
    TikTok: { total: 0, improved: 0, fallback: 0, reasons: new Set() },
  },
}

for (const row of links) {
  const oldDomain = row.metadata?.domain || domainFor(row.url)
  const oldDescription = row.metadata?.description || null
  console.log(`\n${row.url}`)
  console.log(`  old title:  ${logValue(row.title)}`)
  console.log(`  old desc:   ${logValue(oldDescription)}`)
  console.log(`  old image:  ${logValue(row.thumbnail)}`)
  console.log(`  old domain: ${logValue(oldDomain)}`)

  const resolved = await resolveSourceExcerpt(row.url)
  const sourceExcerpt = buildSourceExcerptPayload(row.url, resolved)
  const preview = resolved.preview
  const domain = domainFor(row.url)
  sourceExcerpt.title = cleanString(sourceExcerpt.title, 240) || row.title || domain
  sourceExcerpt.description = cleanString(sourceExcerpt.description, 500) || oldDescription || null
  sourceExcerpt.image = cleanString(sourceExcerpt.image, 2048) || row.thumbnail || null
  sourceExcerpt.source = sourceExcerpt.source || row.metadata?.site_name || domain
  sourceExcerpt.domain = sourceExcerpt.domain || domain
  const metadata = {
    ...(row.metadata || {}),
    description: cleanString(preview?.description, 320) || row.metadata?.description || null,
    canonical_url: cleanString(preview?.canonical, 2048) || row.metadata?.canonical_url || null,
    site_name: cleanString(preview?.siteName, 120) || row.metadata?.site_name || null,
    published_at: cleanString(resolved.published_at, 80) || row.metadata?.published_at || null,
    domain,
    source_excerpt_category: resolved.category,
    source_excerpt_fallback_reason: resolved.fallback_reason,
    excerpt_items: resolved.excerpt_items,
    product: resolved.product,
    source_excerpt: sourceExcerpt,
  }
  const updates = {
    title: cleanString(resolved.product?.name, 180) || cleanString(preview?.title, 180) || row.title || domain,
    thumbnail: cleanString(resolved.product?.image, 2048) || cleanString(preview?.image, 2048) || row.thumbnail || null,
    metadata,
  }

  const { error: updateError } = await supabase
    .from('links')
    .update(updates)
    .eq('id', row.id)

  summary[resolved.category] += 1
  if (resolved.product?.image) summary.withProductImage += 1
  if (resolved.product?.price) summary.withProductPrice += 1
  if (resolved.product) {
    const productDomain = sourceExcerpt.domain || domain || 'unknown'
    summary.productDomains.set(productDomain, (summary.productDomains.get(productDomain) || 0) + 1)
    summary.productDetails.push({
      domain: productDomain,
      title: sourceExcerpt.title,
      image: !!resolved.product.image,
      price: resolved.product.price,
      currency: resolved.product.priceCurrency,
      brand: resolved.product.brand,
      seller: resolved.product.seller,
    })
  }
  if (resolved.fallback_reason) summary.fallback += 1
  if (updateError) summary.failed += 1
  summary.sourceKinds.set(sourceExcerpt.kind, (summary.sourceKinds.get(sourceExcerpt.kind) || 0) + 1)
  if (sourceExcerpt.kind === 'feed') {
    summary.feedSources += 1
    summary.feedItems += sourceExcerpt.items.length
  }
  const hardPlatform = hardPlatformFor(row)
  if (hardPlatform) {
    const hard = summary.hardPlatforms[hardPlatform]
    hard.total += 1
    if (resolved.preview) hard.improved += 1
    if (resolved.fallback_reason) {
      hard.fallback += 1
      hard.reasons.add(resolved.fallback_reason)
    }
  }

  console.log(`  new title:  ${logValue(updates.title)}`)
  console.log(`  new desc:   ${logValue(metadata.description)}`)
  console.log(`  new image:  ${logValue(updates.thumbnail)}`)
  console.log(`  new domain: ${logValue(metadata.domain)}`)
  console.log(`  new date:   ${logValue(metadata.published_at)}`)
  console.log(`  source_excerpt: kind=${sourceExcerpt.kind} title=${yesNo(sourceExcerpt.title)} image=${yesNo(sourceExcerpt.image)} items=${sourceExcerpt.items.length} product=${yesNo(sourceExcerpt.product)} fallback=${logValue(sourceExcerpt.fallback_reason)}`)
  console.log('  summary:')
  console.log(`    category:            ${resolved.category}`)
  console.log(`    title present:       ${yesNo(updates.title)}`)
  console.log(`    image present:       ${yesNo(updates.thumbnail)}`)
  console.log(`    description present: ${yesNo(metadata.description || resolved.product?.description)}`)
  console.log(`    excerpt_items count: ${resolved.excerpt_items.length}`)
  console.log(`    product present:     ${yesNo(resolved.product)}`)
  if (resolved.product) {
    console.log(`    product name:        ${logValue(resolved.product.name)}`)
    console.log(`    product image:       ${yesNo(resolved.product.image)}`)
    console.log(`    product price:       ${logValue(resolved.product.price)}`)
    console.log(`    product currency:    ${logValue(resolved.product.priceCurrency)}`)
    console.log(`    product brand:       ${logValue(resolved.product.brand)}`)
    console.log(`    product seller:      ${logValue(resolved.product.seller)}`)
    console.log(`    product availability:${logValue(resolved.product.availability)}`)
    console.log(`    product condition:   ${logValue(resolved.product.condition)}`)
  }
  console.log(`    fallback reason:     ${logValue(resolved.fallback_reason)}`)
  for (const item of resolved.excerpt_items) {
    console.log(`    item:                ${item.title}${item.url ? ` (${item.url})` : ''}`)
  }
  console.log(updateError ? `  failure: ${updateError.message}` : '  success')
}

console.log('\nProduct summary')
console.log(`  products detected:      ${summary.product}`)
console.log(`  product images:         ${summary.withProductImage}`)
console.log(`  product prices:         ${summary.withProductPrice}`)
console.log(`  product domains:        ${Array.from(summary.productDomains.entries()).map(([domain, count]) => `${domain}=${count}`).join(', ') || 'none'}`)
console.log(`  feed/article/generic:   ${summary.feed}/${summary.article}/${summary.generic}`)
console.log(`  fallback reasons:       ${summary.fallback}`)
console.log(`  update failures:        ${summary.failed}`)
for (const detail of summary.productDetails) {
  console.log(
    `  product: ${detail.domain} title=${yesNo(detail.title)} image=${yesNo(detail.image)} price=${logValue(detail.price)} currency=${logValue(detail.currency)} brand=${logValue(detail.brand)} seller=${logValue(detail.seller)}`
  )
}

console.log('\nSource summary')
console.log(`  feed sources:           ${summary.feedSources}`)
console.log(`  feed items stored:      ${summary.feedItems}`)
console.log(`  source kinds:           ${Array.from(summary.sourceKinds.entries()).map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none'}`)

console.log('\nHard platform summary')
for (const [platform, hard] of Object.entries(summary.hardPlatforms)) {
  console.log(`  ${platform}: total=${hard.total} safe_metadata=${hard.improved} fallback=${hard.fallback}`)
  if (hard.reasons.size) console.log(`    fallback reasons: ${Array.from(hard.reasons).join(', ')}`)
}
