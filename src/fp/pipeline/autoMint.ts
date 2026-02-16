/**
 * AUTO-MINT PIPELINE — Connects all agents into a single flow.
 *
 * Full loop:
 *   clock.scan() → taste.curate() → POST /api/aro/mint →
 *   screenshot.capture() → postpack.generate() → deploy.place()
 *
 * Modes:
 *   auto  — full loop: scan trends, pick top nouns, mint + deploy
 *   batch — mint N rooms from trend scan (no deploy)
 *   mint  — single noun → mint + screenshots + postpacks + deploy
 */

import { getConfig } from '../env.js'
import { scan } from '../agents/clock.js'
import { curate } from '../agents/taste.js'
import { capture } from '../agents/screenshot.js'
import { generate } from '../agents/postpack.js'
import { placeAll } from '../agents/deploy.js'
import { analyze } from '../agents/darwin.js'
import type {
  PipelineOptions,
  PipelineResult,
  MintPayload,
  MintResult,
  DarwinFeedback,
} from '../types.js'

// ─── Mint via API ───────────────────────────────────────

async function mintRoom(payload: MintPayload): Promise<MintResult> {
  const config = getConfig()

  const response = await fetch(`${config.FP_BASE_URL}/api/aro/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mint API error ${response.status}: ${text}`)
  }

  return response.json()
}

// ─── Process a single noun through the full pipeline ────

async function processNoun(
  noun: string,
  opts: PipelineOptions,
  feedback?: DarwinFeedback,
  category?: string
): Promise<PipelineResult> {
  const result: PipelineResult = { noun }

  try {
    // 1. Taste: generate mint payload
    console.log(`\n[pipeline] → taste.curate("${noun}")`)
    const payload = await curate({
      noun,
      category,
      feedback,
    })

    if (opts.dry_run) {
      console.log(`[pipeline] DRY RUN — would mint: ${payload.slug}`)
      console.log(`  images: ${payload.image_urls.length}`)
      console.log(`  music: ${payload.music_url || 'none'}`)
      console.log(`  theme: ${payload.theme_id}`)
      return result
    }

    // 2. Mint: create the room
    console.log(`[pipeline] → minting ${payload.slug}...`)
    const mintResult = await mintRoom(payload)
    result.mint = mintResult
    console.log(`[pipeline] minted: ${mintResult.room_url} (serial #${mintResult.serial_number}, ${mintResult.tile_count} tiles)`)

    // 3. Screenshots
    if (!opts.skip_screenshots) {
      console.log(`[pipeline] → screenshot.capture("${mintResult.slug}")`)
      try {
        const screenshotResult = await capture(mintResult.slug)
        result.screenshots = screenshotResult
      } catch (err: any) {
        console.error(`[pipeline] screenshot failed: ${err.message}`)
      }
    }

    // 4. Postpacks
    if (!opts.skip_deploy && result.screenshots) {
      console.log(`[pipeline] → postpack.generate()`)
      try {
        const postpacks = await generate({
          slug: mintResult.slug,
          display_name: payload.display_name,
          bio: payload.bio,
          category: category || 'general',
          room_url: mintResult.room_url,
          screenshots: result.screenshots.screenshots,
        })
        result.postpacks = postpacks
      } catch (err: any) {
        console.error(`[pipeline] postpack failed: ${err.message}`)
      }
    }

    // 5. Deploy
    if (!opts.skip_deploy && result.postpacks && result.postpacks.length > 0) {
      console.log(`[pipeline] → deploy.placeAll()`)
      try {
        const deployments = await placeAll(result.postpacks, {
          serial_number: mintResult.serial_number,
          room_id: mintResult.room_id,
          pack_id: category || 'auto',
        })
        result.deployments = deployments
      } catch (err: any) {
        console.error(`[pipeline] deploy failed: ${err.message}`)
      }
    }
  } catch (err: any) {
    result.error = err.message
    console.error(`[pipeline] FAILED for "${noun}": ${err.message}`)
  }

  return result
}

// ─── Pipeline modes ─────────────────────────────────────

/**
 * Mint a single noun through the full pipeline.
 */
export async function mintSingle(
  noun: string,
  opts?: Partial<PipelineOptions>
): Promise<PipelineResult> {
  const fullOpts: PipelineOptions = {
    mode: 'mint',
    ...opts,
  }

  console.log(`\n════════════════════════════════════════`)
  console.log(`  CULTURE PIPELINE — SINGLE MINT`)
  console.log(`  noun: "${noun}"`)
  console.log(`════════════════════════════════════════\n`)

  return processNoun(noun, fullOpts)
}

/**
 * Full autonomous loop:
 *   1. Darwin analyzes past performance
 *   2. Clock scans for trending nouns
 *   3. Process top N nouns through the pipeline
 */
export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult[]> {
  const count = opts.count || 5
  const results: PipelineResult[] = []

  console.log(`\n════════════════════════════════════════`)
  console.log(`  CULTURE PIPELINE — ${opts.mode.toUpperCase()}`)
  console.log(`  count: ${count}`)
  console.log(`════════════════════════════════════════\n`)

  // 1. Darwin feedback (skip on first run / if no data)
  let feedback: DarwinFeedback | undefined
  try {
    console.log(`[pipeline] → darwin.analyze()`)
    feedback = await analyze(30)
  } catch (err: any) {
    console.log(`[pipeline] darwin skipped (no data yet): ${err.message}`)
  }

  // 2. Clock: scan trends
  console.log(`[pipeline] → clock.scan()`)
  const nouns = await scan()

  if (nouns.length === 0) {
    console.log(`[pipeline] no nouns found — nothing to mint`)
    return results
  }

  // Take top N nouns by urgency
  const selected = nouns.slice(0, count)
  console.log(`[pipeline] selected ${selected.length} nouns:`)
  selected.forEach((n, i) => {
    console.log(`  ${i + 1}. "${n.noun}" (urgency=${n.urgency.toFixed(2)}, category=${n.category})`)
  })

  // 3. Process each noun sequentially (avoid rate limits)
  for (const clockNoun of selected) {
    const result = await processNoun(
      clockNoun.noun,
      opts,
      feedback,
      clockNoun.category
    )
    results.push(result)

    // Brief pause between mints
    if (selected.indexOf(clockNoun) < selected.length - 1) {
      console.log(`[pipeline] cooling down 3s...`)
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  // Summary
  const minted = results.filter(r => r.mint).length
  const failed = results.filter(r => r.error).length
  console.log(`\n════════════════════════════════════════`)
  console.log(`  PIPELINE COMPLETE`)
  console.log(`  minted: ${minted}  failed: ${failed}  total: ${results.length}`)
  console.log(`════════════════════════════════════════\n`)

  return results
}
