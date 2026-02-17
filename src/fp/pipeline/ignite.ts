/**
 * IGNITE PIPELINE — the revenue engine.
 *
 * One command. 50 cultural tribute rooms minted, screenshotted,
 * and posted to X + IG tagging the source accounts. Zero manual work.
 *
 * Flow per target (5 concurrent):
 *   1. taste.curate(noun) → mint payload
 *   2. POST /api/aro/mint → room exists
 *   3. screenshot 4 formats (og, square, story, thumb)
 *   4. generate tag post text for X and IG
 *   5. post to X (if keys available) / save to files
 *   6. save meta.json + contribute to FIRE-ORDER.md
 *
 * 50 rooms × 5 concurrent = under 3 minutes.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { getConfig } from '../env.js'
import { curate } from '../agents/taste.js'
import { captureRoom } from '../agents/screenshot.js'
import { postSocial } from '../agents/social-post.js'
import type { CulturalTarget } from '../data/cultural-targets.js'
import type { MintPayload, MintResult } from '../types.js'

// ─── Types ──────────────────────────────────────────────

export interface IgniteOptions {
  tier?: 1 | 2 | 3
  noun?: string
  dry_run?: boolean
  concurrency?: number
}

interface IgniteResult {
  target: CulturalTarget
  slug: string
  serial: number
  room_url: string
  mint_result?: MintResult
  screenshot_files: Record<string, string>
  social_results: Array<{ platform: string; status: string }>
  error?: string
  elapsed_ms: number
}

// ─── Mint via API (same as autoMint.ts) ─────────────────

async function mintRoom(payload: MintPayload): Promise<MintResult> {
  const config = getConfig()

  const response = await fetch(`${config.FP_BASE_URL}/api/aro/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mint API ${response.status}: ${text.slice(0, 300)}`)
  }

  return response.json()
}

// ─── Process a single target ────────────────────────────

async function processTarget(
  target: CulturalTarget,
  opts: IgniteOptions
): Promise<IgniteResult> {
  const start = Date.now()
  const config = getConfig()
  const result: IgniteResult = {
    target,
    slug: '',
    serial: 0,
    room_url: '',
    screenshot_files: {},
    social_results: [],
    elapsed_ms: 0,
  }

  try {
    // 1. TASTE → mint payload
    console.log(`\n  [ignite] ─── ${target.noun} (tier ${target.tier}) ───`)
    const payload = await curate({ noun: target.noun, category: target.category })
    result.slug = payload.slug
    result.room_url = `${config.FP_BASE_URL}/${payload.slug}`

    // 2. MINT
    if (opts.dry_run) {
      console.log(`  [ignite] DRY RUN — would mint: ${payload.slug}`)
      result.serial = 0
    } else {
      console.log(`  [ignite] minting ${payload.slug}...`)
      const mintResult = await mintRoom(payload)
      result.mint_result = mintResult
      result.serial = mintResult.serial_number
      result.room_url = mintResult.room_url
      console.log(`  [ignite] minted: ${mintResult.room_url} (#${mintResult.serial_number})`)
    }

    // 3. SCREENSHOT (4 formats)
    const screenshots = await captureRoom(result.slug, config.FP_BASE_URL)
    result.screenshot_files = screenshots.files

    // 4 + 5. SOCIAL POST (X + IG)
    if (target.twitter || target.instagram) {
      const socialResults = await postSocial({
        slug: result.slug,
        serial: result.serial,
        room_url: result.room_url,
        twitter_handle: target.twitter,
        instagram_handle: target.instagram,
        screenshot_dir: screenshots.dir,
        screenshot_files: screenshots.files,
      }, { dry_run: opts.dry_run })

      result.social_results = socialResults.map(r => ({
        platform: r.platform,
        status: r.status,
      }))
    }

    // 6. SAVE META
    const metaPath = resolve(screenshots.dir, 'meta.json')
    writeFileSync(metaPath, JSON.stringify({
      slug: result.slug,
      serial: result.serial,
      room_url: result.room_url,
      noun: target.noun,
      twitter: target.twitter,
      instagram: target.instagram,
      tier: target.tier,
      category: target.category,
      screenshot_files: result.screenshot_files,
      social_results: result.social_results,
      minted_at: new Date().toISOString(),
    }, null, 2), 'utf-8')

  } catch (err: any) {
    result.error = err.message
    console.error(`  [ignite] FAILED: ${target.noun} — ${err.message}`)
  }

  result.elapsed_ms = Date.now() - start
  return result
}

// ─── Promise pool (concurrency limiter) ─────────────────

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function worker() {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ─── FIRE-ORDER.md generator ────────────────────────────

function generateFireOrder(results: IgniteResult[]): string {
  const lines: string[] = [
    '# FIRE ORDER',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total: ${results.length} rooms`,
    `Successful: ${results.filter(r => !r.error).length}`,
    `Failed: ${results.filter(r => r.error).length}`,
    '',
    '---',
    '',
  ]

  // Group by tier
  for (const tier of [1, 2, 3] as const) {
    const tierResults = results.filter(r => r.target.tier === tier)
    if (tierResults.length === 0) continue

    const tierLabel = tier === 1 ? 'MEGA (10M+)' : tier === 2 ? 'CULTURE (1M-10M)' : 'NICHE HEAT (<1M)'
    lines.push(`## TIER ${tier} — ${tierLabel}`)
    lines.push('')

    for (const r of tierResults) {
      if (r.error) {
        lines.push(`### ${r.target.noun} — FAILED`)
        lines.push(`Error: ${r.error}`)
        lines.push('')
        continue
      }

      lines.push(`### ${r.target.noun}`)
      lines.push('')
      lines.push(`- **Room:** ${r.room_url}`)
      lines.push(`- **Serial:** #${r.serial}`)
      lines.push(`- **Slug:** ${r.slug}`)
      lines.push(`- **Screenshots:** ${Object.keys(r.screenshot_files).join(', ') || 'none'}`)
      lines.push('')

      // X post text (ready to copy)
      if (r.target.twitter) {
        lines.push('**X Post (copy):**')
        lines.push('```')
        lines.push(`${r.target.twitter}`)
        lines.push(`${r.room_url}`)
        lines.push(`#${r.serial}`)
        lines.push('```')
        lines.push(`Attach: ignition-output/${r.slug}/og.png`)
        lines.push('')
      }

      // IG caption (ready to copy)
      if (r.target.instagram) {
        lines.push('**IG Caption (copy):**')
        lines.push('```')
        lines.push(`${r.room_url} #${r.serial}`)
        lines.push('```')
        lines.push(`Tag: ${r.target.instagram}`)
        lines.push(`Image: ignition-output/${r.slug}/square.png`)
        lines.push('')
      }

      lines.push(`- **Handles:** X=${r.target.twitter || 'none'} IG=${r.target.instagram || 'none'}`)
      lines.push(`- **Category:** ${r.target.category}`)
      lines.push(`- **Time:** ${(r.elapsed_ms / 1000).toFixed(1)}s`)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ─── Main: ignite ───────────────────────────────────────

export async function ignite(opts: IgniteOptions = {}): Promise<void> {
  const startTime = Date.now()
  const concurrency = opts.concurrency || 5

  // Load targets
  const { TARGETS } = await import('../data/cultural-targets.js')

  // Filter targets
  let targets = [...TARGETS]

  if (opts.noun) {
    const search = opts.noun.toLowerCase()
    targets = targets.filter(t => t.noun.toLowerCase().includes(search))
    if (targets.length === 0) {
      console.error(`No targets matching "${opts.noun}"`)
      process.exit(1)
    }
  } else if (opts.tier) {
    targets = targets.filter(t => t.tier === opts.tier)
  }

  // Sort by tier (1 first)
  targets.sort((a, b) => a.tier - b.tier)

  const outputDir = resolve(process.cwd(), 'ignition-output')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  console.log(`
╔══════════════════════════════════════════╗
║            IGNITION PIPELINE             ║
║   ${String(targets.length).padStart(2)} targets × ${concurrency} concurrent             ║
║   ${opts.dry_run ? 'DRY RUN — no posting' : 'LIVE — minting + posting'}               ║
╚══════════════════════════════════════════╝
`)

  if (opts.tier) {
    console.log(`  Filter: tier ${opts.tier} only`)
  }
  if (opts.noun) {
    console.log(`  Filter: noun matching "${opts.noun}"`)
  }
  console.log(`  Output: ${outputDir}`)
  console.log()

  // Run the pool
  const results = await runPool(targets, concurrency, (target) =>
    processTarget(target, opts)
  )

  // Generate FIRE-ORDER.md
  const fireOrder = generateFireOrder(results)
  const fireOrderPath = resolve(outputDir, 'FIRE-ORDER.md')
  writeFileSync(fireOrderPath, fireOrder, 'utf-8')

  // Summary
  const succeeded = results.filter(r => !r.error).length
  const failed = results.filter(r => r.error).length
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  const tweeted = results.reduce((n, r) =>
    n + r.social_results.filter(s => s.platform === 'twitter' && s.status === 'posted').length, 0
  )
  const saved = results.reduce((n, r) =>
    n + r.social_results.filter(s => s.status === 'saved').length, 0
  )

  console.log(`
════════════════════════════════════════════
  IGNITION COMPLETE

  Rooms minted:  ${succeeded}/${targets.length}
  Failed:        ${failed}
  Tweeted:       ${tweeted}
  Posts saved:   ${saved}
  Time:          ${totalElapsed}s

  Output:        ${outputDir}
  Fire order:    ${fireOrderPath}
════════════════════════════════════════════
`)
}
