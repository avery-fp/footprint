/**
 * DISTRIBUTION PIPELINE — the continuous loop.
 *
 * scan → generate → deploy → log → wait → repeat
 *
 * Modes:
 *   npm run fp:distribute              — continuous (runs forever)
 *   npm run fp:distribute -- --once    — single cycle then exit
 *   npm run fp:distribute -- --dry-run — generate but don't post
 *   npm run fp:distribute -- --room footprint.onl/ae
 *   npm run fp:distribute -- --platforms reddit,twitter
 *
 * The machine breathes. Every 60 seconds it scans, generates, deploys.
 */

import { scan } from '../agents/scanner.js'
import { generateComments } from '../agents/postpack.js'
import { deploy } from '../agents/deploy.js'
import { getStats } from '../agents/deploy-log.js'
import type { Platform } from '../agents/scanner.js'

// ─── Types ──────────────────────────────────────────────

export interface DistributeOptions {
  once?: boolean
  dry_run?: boolean
  room_url?: string
  platforms?: Platform[]
  cycle_interval?: number // ms between cycles (default 60s)
}

// ─── Single cycle ───────────────────────────────────────

async function runCycle(opts: DistributeOptions, cycleNumber: number): Promise<void> {
  const roomUrl = opts.room_url || 'footprint.onl/ae'
  const platforms = opts.platforms || ['reddit', 'twitter', 'youtube']

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  CYCLE #${cycleNumber} | ${new Date().toISOString()}`)
  console.log(`  room: ${roomUrl}`)
  console.log(`  platforms: ${platforms.join(', ')}`)
  console.log(`  mode: ${opts.dry_run ? 'DRY RUN' : 'LIVE'}`)
  console.log(`${'─'.repeat(50)}`)

  // 1. SCAN — find deployment targets
  console.log(`\n  [1/3] SCANNING...`)
  const targets = await scan({ platforms, limit: 50 })

  if (targets.length === 0) {
    console.log(`  [scanner] no relevant targets found this cycle`)
    return
  }

  // 2. GENERATE — create contextual comments via Haiku
  console.log(`\n  [2/3] GENERATING comments for ${targets.length} targets...`)
  const comments = await generateComments(targets, roomUrl)

  if (comments.length === 0) {
    console.log(`  [postpack] no comments generated this cycle`)
    return
  }

  // 3. DEPLOY — post comments across platforms
  console.log(`\n  [3/3] DEPLOYING ${comments.length} comments...`)
  const results = await deploy(comments, { dry_run: opts.dry_run, platforms })

  // Cycle summary
  const posted = results.filter(r => r.status === 'posted').length
  const queued = results.filter(r => r.status === 'queued').length
  const failed = results.filter(r => r.status === 'failed').length
  const rateLimited = results.filter(r => r.status === 'rate_limited').length
  const dryRun = results.filter(r => r.status === 'dry_run').length

  console.log(`\n  CYCLE #${cycleNumber} COMPLETE`)
  console.log(`  targets: ${targets.length} | comments: ${comments.length}`)

  if (opts.dry_run) {
    console.log(`  dry run: ${dryRun} | queued: ${queued}`)
  } else {
    console.log(`  posted: ${posted} | queued: ${queued} | failed: ${failed} | rate_limited: ${rateLimited}`)
  }

  // Daily stats
  const stats = getStats()
  console.log(`  today total: ${stats.total} actions (${stats.posted} posted)`)
}

// ─── Main loop ──────────────────────────────────────────

export async function distribute(opts: DistributeOptions = {}): Promise<void> {
  const cycleInterval = opts.cycle_interval || 60_000 // 60 seconds

  console.log(`
╔══════════════════════════════════════════╗
║       FOOTPRINT DISTRIBUTION ENGINE      ║
║        scan → generate → deploy          ║
╚══════════════════════════════════════════╝
`)

  console.log(`  Room: ${opts.room_url || 'footprint.onl/ae'}`)
  console.log(`  Mode: ${opts.once ? 'SINGLE CYCLE' : 'CONTINUOUS'}${opts.dry_run ? ' (DRY RUN)' : ''}`)
  console.log(`  Platforms: ${(opts.platforms || ['reddit', 'twitter', 'youtube']).join(', ')}`)
  console.log(`  Cycle interval: ${cycleInterval / 1000}s`)

  // Check which platform keys are available
  const available: string[] = []
  const missing: string[] = []

  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    available.push('Reddit (post)')
  } else {
    missing.push('Reddit (post) — REDDIT_CLIENT_ID/SECRET missing')
  }
  // Reddit read always works — no auth needed
  available.push('Reddit (scan)')

  if (process.env.TWITTER_BEARER_TOKEN) available.push('Twitter (scan)')
  else missing.push('Twitter (scan) — TWITTER_BEARER_TOKEN missing')
  if (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN) available.push('Twitter (post)')
  else missing.push('Twitter (post) — TWITTER_API_KEY/ACCESS_TOKEN missing')

  if (process.env.YOUTUBE_API_KEY) available.push('YouTube (scan)')
  else missing.push('YouTube (scan) — YOUTUBE_API_KEY missing')
  if (process.env.YOUTUBE_OAUTH_TOKEN) available.push('YouTube (post)')
  else missing.push('YouTube (post) — YOUTUBE_OAUTH_TOKEN missing')

  if (process.env.ANTHROPIC_API_KEY) available.push('Haiku (comments)')
  else missing.push('Haiku (comments) — ANTHROPIC_API_KEY missing')

  console.log(`\n  Available: ${available.join(', ')}`)
  if (missing.length) {
    console.log(`  Missing: ${missing.join(', ')}`)
    console.log(`  (missing platforms will queue comments for manual posting)`)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`\n  ANTHROPIC_API_KEY is required for comment generation. Exiting.`)
    process.exit(1)
  }

  // Single cycle mode
  if (opts.once) {
    await runCycle(opts, 1)
    return
  }

  // Continuous mode — run forever
  let cycle = 0

  // Handle graceful shutdown
  let running = true
  const shutdown = () => {
    console.log(`\n  [distribute] shutting down gracefully...`)
    running = false
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  while (running) {
    cycle++
    try {
      await runCycle(opts, cycle)
    } catch (err: any) {
      console.error(`\n  [distribute] cycle ${cycle} failed: ${err.message}`)
      // Don't crash the loop on individual cycle failures
    }

    if (!running) break

    console.log(`\n  [distribute] sleeping ${cycleInterval / 1000}s until next cycle...`)
    await sleep(cycleInterval)
  }

  const stats = getStats()
  console.log(`\n  FINAL STATS: ${stats.total} total actions, ${stats.posted} posted`)
  console.log(`  Platform breakdown: ${JSON.stringify(stats.by_platform)}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
