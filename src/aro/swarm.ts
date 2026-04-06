/**
 * SWARM — Email Swarm Pipeline Orchestrator
 *
 * The single heavy pipe: Scrape → Enrich → Mirror → Send → Monitor
 * Runs as a continuous loop or single cycle.
 *
 * This is the brain that coordinates all four organs.
 */

import { scrapeCity, scrapeBatch, type ScrapeOptions, type BatchScrapeOptions } from './scraper'
import { enrichTargets, type EnrichOptions } from './enricher'
import { generateMirrorHooks, type MirrorOptions } from './mirror'
import { sendBatch, type SendOptions } from './sender'
import { runMonitorCycle, getHealthSummary } from './monitor'
import type { SwarmCycleResult } from './types'

// ─── Default target cities/categories ─────────────────────

const DEFAULT_TARGETS: Array<{ city: string; category: string }> = [
  // Start with high-density, creative-adjacent businesses
  { city: 'Los Angeles, CA', category: 'barbershop' },
  { city: 'Los Angeles, CA', category: 'tattoo' },
  { city: 'Los Angeles, CA', category: 'salon' },
  { city: 'New York, NY', category: 'barbershop' },
  { city: 'New York, NY', category: 'tattoo' },
  { city: 'New York, NY', category: 'gallery' },
  { city: 'Miami, FL', category: 'barbershop' },
  { city: 'Miami, FL', category: 'salon' },
  { city: 'Chicago, IL', category: 'barbershop' },
  { city: 'Chicago, IL', category: 'tattoo' },
  { city: 'Austin, TX', category: 'barbershop' },
  { city: 'Austin, TX', category: 'cafe' },
  { city: 'Portland, OR', category: 'cafe' },
  { city: 'Portland, OR', category: 'tattoo' },
  { city: 'Seattle, WA', category: 'cafe' },
  { city: 'Brooklyn, NY', category: 'boutique' },
  { city: 'San Francisco, CA', category: 'cafe' },
  { city: 'Nashville, TN', category: 'barbershop' },
  { city: 'Denver, CO', category: 'gym' },
  { city: 'Atlanta, GA', category: 'barbershop' },
]

// ─── Swarm options ────────────────────────────────────────

export interface SwarmOptions {
  // Pipeline control
  scrapeOnly?: boolean
  enrichOnly?: boolean
  mirrorOnly?: boolean
  sendOnly?: boolean
  monitorOnly?: boolean

  // Batch sizes
  scrapeBatchSize?: number   // city/category pairs per cycle (default 3)
  enrichBatchSize?: number   // targets to enrich per cycle (default 50)
  mirrorBatchSize?: number   // hooks to generate per cycle (default 20)
  sendBatchSize?: number     // emails to send per cycle (default 50)

  // Scraper config
  targets?: Array<{ city: string; category: string }>
  scrapeRadius?: number
  maxPerTarget?: number

  // Timing
  cycleIntervalMs?: number   // ms between cycles (default 60000)
  once?: boolean             // single cycle, don't loop

  // Safety
  dryRun?: boolean
  limit?: number             // total emails to send before stopping
}

// ─── Single cycle ─────────────────────────────────────────

export async function runCycle(opts: SwarmOptions = {}): Promise<SwarmCycleResult> {
  const result: SwarmCycleResult = {
    scraped: 0,
    enriched: 0,
    mirrored: 0,
    sent: 0,
    bounced: 0,
    errors: [],
  }

  const startTime = Date.now()

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║         EMAIL SWARM — CYCLE START        ║')
  console.log(`║   ${new Date().toISOString()}`)
  console.log(`║   mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('╚══════════════════════════════════════════╝')

  try {
    // ── Step 1: SCRAPE ──────────────────────────────────
    if (!opts.enrichOnly && !opts.mirrorOnly && !opts.sendOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 1: SCRAPE ──')
      const targets = opts.targets || DEFAULT_TARGETS
      const batchSize = opts.scrapeBatchSize || 3

      // Pick a slice of targets for this cycle
      const cycleTargets = targets.slice(0, batchSize)

      const scrapeResult = await scrapeBatch({
        targets: cycleTargets,
        radius: opts.scrapeRadius,
        maxPerTarget: opts.maxPerTarget || 60,
        dryRun: opts.dryRun,
      })

      result.scraped = scrapeResult.scraped
      result.errors.push(...scrapeResult.errors)
    }

    // ── Step 2: ENRICH ──────────────────────────────────
    if (!opts.scrapeOnly && !opts.mirrorOnly && !opts.sendOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 2: ENRICH ──')
      const enrichResult = await enrichTargets({
        batchSize: opts.enrichBatchSize || 50,
        dryRun: opts.dryRun,
      })

      result.enriched = enrichResult.enriched
      result.errors.push(...enrichResult.errors)
    }

    // ── Step 3: MIRROR ──────────────────────────────────
    if (!opts.scrapeOnly && !opts.enrichOnly && !opts.sendOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 3: MIRROR ──')
      const mirrorResult = await generateMirrorHooks({
        batchSize: opts.mirrorBatchSize || 20,
        dryRun: opts.dryRun,
      })

      result.mirrored = mirrorResult.generated
      result.errors.push(...mirrorResult.errors)
    }

    // ── Step 4: SEND ────────────────────────────────────
    if (!opts.scrapeOnly && !opts.enrichOnly && !opts.mirrorOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 4: SEND ──')
      const sendResult = await sendBatch({
        batchSize: opts.sendBatchSize || 50,
        dryRun: opts.dryRun,
      })

      result.sent = sendResult.sent
    }

    // ── Step 5: MONITOR ─────────────────────────────────
    if (!opts.scrapeOnly && !opts.enrichOnly && !opts.mirrorOnly && !opts.sendOnly) {
      console.log('\n  ── STEP 5: MONITOR ──')
      const monitorResult = await runMonitorCycle()

      result.bounced = monitorResult.totalBounces
      result.errors.push(...monitorResult.alerts)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.errors.push(`Cycle error: ${msg}`)
    console.error(`\n  [swarm] CYCLE ERROR: ${msg}`)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n  ────────────────────────────────────────')
  console.log(`  CYCLE COMPLETE in ${elapsed}s`)
  console.log(`  scraped: ${result.scraped} | enriched: ${result.enriched} | mirrored: ${result.mirrored} | sent: ${result.sent} | bounced: ${result.bounced}`)
  if (result.errors.length > 0) {
    console.log(`  errors: ${result.errors.length}`)
  }
  console.log('  ────────────────────────────────────────\n')

  return result
}

// ─── Continuous loop ──────────────────────────────────────

export async function runSwarm(opts: SwarmOptions = {}): Promise<void> {
  const cycleInterval = opts.cycleIntervalMs || 60000
  let totalSent = 0
  const limit = opts.limit || Infinity

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║         EMAIL SWARM — ENGINE START       ║')
  console.log('║                                          ║')
  console.log('║   scrape → enrich → mirror → send → mon ║')
  console.log(`║   cycle interval: ${cycleInterval / 1000}s`)
  console.log(`║   limit: ${limit === Infinity ? 'unlimited' : limit}`)
  console.log(`║   mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE FIRE'}`)
  console.log('╚══════════════════════════════════════════╝\n')

  // Print health summary before starting
  const health = await getHealthSummary()
  if (health.domains.length > 0) {
    console.log('  Domain health:')
    for (const d of health.domains) {
      console.log(`    ${d.domain}: ${d.status} (day ${d.warmupDay}, ${d.sentToday} sent, bounce ${(d.bounceRate * 100).toFixed(1)}%)`)
    }
  } else {
    console.log('  No sending domains configured. Will use Resend as fallback.')
  }

  if (opts.once) {
    await runCycle(opts)
    return
  }

  // Continuous loop
  let cycle = 0
  while (totalSent < limit) {
    cycle++
    console.log(`\n  ═══ CYCLE ${cycle} ═══`)

    const result = await runCycle(opts)
    totalSent += result.sent

    if (totalSent >= limit) {
      console.log(`\n  [swarm] limit reached: ${totalSent}/${limit} emails sent. Stopping.`)
      break
    }

    // Check if all domains are paused
    const currentHealth = await getHealthSummary()
    if (!currentHealth.allHealthy && currentHealth.domains.length > 0) {
      console.log('\n  [swarm] WARNING: some domains paused. Check monitor alerts.')
    }

    console.log(`  [swarm] sleeping ${cycleInterval / 1000}s until next cycle...`)
    await new Promise(r => setTimeout(r, cycleInterval))
  }
}
