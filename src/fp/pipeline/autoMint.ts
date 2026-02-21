/**
 * AUTO-MINT PIPELINE — taste.curate() → POST /api/aro/mint
 *
 * Stripped version: only taste + mint for fp:mint mode.
 * Other agents (clock, screenshot, postpack, deploy, darwin)
 * can be added later without changing this file's exports.
 */

import { getConfig } from '../env.js'
import { curate } from '../agents/taste.js'
import type {
  PipelineOptions,
  PipelineResult,
  MintPayload,
  MintResult,
} from '../types.js'

// ─── Mint via API ───────────────────────────────────────

async function mintRoom(payload: MintPayload): Promise<MintResult> {
  const config = getConfig()

  const response = await fetch(`${config.FP_BASE_URL}/api/aro/mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.ARO_KEY}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mint API error ${response.status}: ${text}`)
  }

  return response.json()
}

// ─── Process a single noun ──────────────────────────────

async function processNoun(
  noun: string,
  opts: PipelineOptions,
  category?: string
): Promise<PipelineResult> {
  const result: PipelineResult = { noun }

  try {
    console.log(`\n[pipeline] → taste.curate("${noun}")`)
    const payload = await curate({
      noun,
      category,
    })

    if (opts.dry_run) {
      console.log(`[pipeline] DRY RUN — would mint: ${payload.slug}`)
      console.log(`  images: ${payload.image_urls.length}`)
      console.log(`  music: ${payload.music_url || 'none'}`)
      console.log(`  theme: ${payload.theme_id}`)
      return result
    }

    console.log(`[pipeline] → minting ${payload.slug}...`)
    const mintResult = await mintRoom(payload)
    result.mint = mintResult
    console.log(`[pipeline] minted: ${mintResult.room_url} (serial #${mintResult.serial_number}, ${mintResult.tile_count} tiles)`)
  } catch (err: any) {
    result.error = err.message
    console.error(`[pipeline] FAILED for "${noun}": ${err.message}`)
  }

  return result
}

// ─── Exports ────────────────────────────────────────────

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

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult[]> {
  console.error('auto/batch modes require clock, darwin agents (not yet installed)')
  console.error('Use: npm run fp:mint -- --noun "topic"')
  process.exit(1)
}
