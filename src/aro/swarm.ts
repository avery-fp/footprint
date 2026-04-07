/**
 * SWARM — Email Swarm Pipeline Orchestrator
 *
 * The single heavy pipe: Scrape → Enrich → Mirror → Send → Monitor
 * Runs as a continuous loop or single cycle.
 *
 * This is the brain that coordinates all four organs.
 *
 * Dry-run mode: bypasses the entire live pipeline and runs a mock-only
 * pipeline that generates ~10 Mirror Hooks against in-memory mock targets,
 * with NO scrape, NO enrich, NO send, and NO DB writes. The only external
 * call is to the Claude API for hook generation. See runDryRunMockPipeline.
 *
 * Live mode (--once or continuous): respects --limit by capping every
 * downstream stage's batch size to the limit. See runCycle.
 */

import { scrapeCity, scrapeBatch, type ScrapeOptions, type BatchScrapeOptions } from './scraper'
import { enrichTargets, type EnrichOptions } from './enricher'
import { generateMirrorHooks, generateMirrorHook, isPostalConfigured, type MirrorOptions } from './mirror'
import { sendBatch, type SendOptions } from './sender'
import { runMonitorCycle, getHealthSummary } from './monitor'
import type { SwarmCycleResult, MirrorHookInput } from './types'

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

// ─── Mock targets for dry-run pipeline ────────────────────
//
// 10 representative businesses across the same categories the live scraper
// targets. Used exclusively by runDryRunMockPipeline. The target_tokens are
// synthetic uuid-v4 values that pass the unsubscribe handler's format check
// without colliding with any real swarm_targets.id.
//
// Coverage:
//   - varied categories (barbershop, tattoo, cafe, salon, gym, gallery,
//     boutique, bar, bookstore, music_venue)
//   - varied review counts (64 to 421)
//   - varied ratings (4.2 to 4.9)
//   - some with rich website_copy, some sparse, some null — to exercise
//     the mirror prompt's fallback behavior

export const MOCK_TARGETS: MirrorHookInput[] = [
  {
    business_name: 'East Side Barbers',
    category: 'barbershop',
    city: 'Brooklyn, NY',
    website_copy: 'cuts since 2014. walk-ins welcome. mon-sat 10-7. cash and venmo. fade specialists.',
    rating: 4.6,
    review_count: 187,
    target_token: '00000000-0000-4000-8000-000000000001',
  },
  {
    business_name: 'Black Lotus Tattoo Studio',
    category: 'tattoo',
    city: 'Los Angeles, CA',
    website_copy: 'private studio. by appointment only. dotwork, blackwork, fine line. follow on ig for booking @blacklotusla',
    rating: 4.9,
    review_count: 312,
    target_token: '00000000-0000-4000-8000-000000000002',
  },
  {
    business_name: 'Maven & Mortar',
    category: 'cafe',
    city: 'Portland, OR',
    website_copy: null,
    rating: 4.4,
    review_count: 89,
    target_token: '00000000-0000-4000-8000-000000000003',
  },
  {
    business_name: 'Bloom Beauty Lounge',
    category: 'salon',
    city: 'Miami, FL',
    website_copy: 'full service hair, nails, lashes. spanish + english. open tues-sun. book on vagaro or text us',
    rating: 4.3,
    review_count: 245,
    target_token: '00000000-0000-4000-8000-000000000004',
  },
  {
    business_name: 'Iron & Oak',
    category: 'gym',
    city: 'Denver, CO',
    website_copy: 'powerlifting and strongman. 24/7 keycard access. no contracts. drop in $20.',
    rating: 4.8,
    review_count: 156,
    target_token: '00000000-0000-4000-8000-000000000005',
  },
  {
    business_name: 'Gallery 47',
    category: 'gallery',
    city: 'New York, NY',
    website_copy: 'contemporary works. rotating monthly shows. opening receptions first friday. private viewings by appointment.',
    rating: 4.7,
    review_count: 64,
    target_token: '00000000-0000-4000-8000-000000000006',
  },
  {
    business_name: 'Folklore Boutique',
    category: 'boutique',
    city: 'Brooklyn, NY',
    website_copy: 'vintage and slow fashion. handmade in brooklyn. open weekends. follow @folklore_bk for restocks.',
    rating: 4.5,
    review_count: 102,
    target_token: '00000000-0000-4000-8000-000000000007',
  },
  {
    business_name: "Quinn's",
    category: 'bar',
    city: 'Austin, TX',
    website_copy: null,
    rating: 4.2,
    review_count: 421,
    target_token: '00000000-0000-4000-8000-000000000008',
  },
  {
    business_name: 'Pearl & Paper',
    category: 'bookstore',
    city: 'San Francisco, CA',
    website_copy: 'independent. used and rare. literature, philosophy, art books. open everyday 11-8.',
    rating: 4.9,
    review_count: 78,
    target_token: '00000000-0000-4000-8000-000000000009',
  },
  {
    business_name: 'Sun Drum Music Co.',
    category: 'music_venue',
    city: 'Nashville, TN',
    website_copy: 'live music every night. local and touring acts. doors at 8. cash bar. tickets at the door or eventbrite.',
    rating: 4.6,
    review_count: 198,
    target_token: '00000000-0000-4000-8000-000000000010',
  },
]

// ─── Dry-run mock pipeline ────────────────────────────────
//
// The legitimate dry-run path. Bypasses scrape/enrich/sender/monitor entirely.
// For up to N mock targets (capped by --limit), calls generateMirrorHook to
// produce a real LLM-generated hook with the CAN-SPAM compliance footer
// applied, then prints subject + body + diagnostics. No DB. No SES. No
// Google Places. No website fetches. The only external call is Claude.
//
// This is the only place dry-run output should come from after the refactor.
// The legacy in-loop dryRun checks in scraper/enricher/mirror/sender/monitor
// are now hard-guarded short-circuits (defense in depth).

async function runDryRunMockPipeline(opts: SwarmOptions): Promise<void> {
  const limit = opts.limit ?? MOCK_TARGETS.length
  const mocksToProcess = MOCK_TARGETS.slice(0, Math.min(limit, MOCK_TARGETS.length))

  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║      EMAIL SWARM — DRY-RUN MOCK MODE         ║')
  console.log('║   no scrape · no enrich · no send · no DB    ║')
  console.log(`║   mocks to process: ${String(mocksToProcess.length).padEnd(2)}/${MOCK_TARGETS.length}                    ║`)
  console.log('║   external calls: Claude API only            ║')
  console.log('╚══════════════════════════════════════════════╝\n')

  // Compliance pre-check (informational; the dry-run is allowed to proceed
  // with the placeholder so the operator can audit the format).
  if (isPostalConfigured()) {
    console.log('  [compliance] postal address: CONFIGURED (live send would proceed)')
  } else {
    console.log('  [compliance] postal address: NOT CONFIGURED — footer will use placeholder')
    console.log('  [compliance] live send mode would REFUSE to generate. Set ARO_POSTAL_ADDRESS in .env before any real send.')
  }
  console.log()

  let i = 0
  let succeeded = 0
  let totalTokens = 0
  const errors: string[] = []

  for (const mock of mocksToProcess) {
    i++
    console.log('══════════════════════════════════════════════')
    console.log(`  MOCK ${i}/${mocksToProcess.length}: ${mock.business_name}`)
    console.log(`  category: ${mock.category} · city: ${mock.city}`)
    console.log(`  rating: ${mock.rating ?? 'unknown'}/5 (${mock.review_count} reviews)`)
    console.log(`  website_copy: ${mock.website_copy ? `"${mock.website_copy.slice(0, 80)}${mock.website_copy.length > 80 ? '...' : ''}"` : 'NONE'}`)
    console.log('──────────────────────────────────────────────')

    try {
      const hook = await generateMirrorHook(mock)
      succeeded++
      totalTokens += hook.tokens_used

      console.log(`  SUBJECT: ${hook.subject}`)
      console.log('  ──')
      console.log('  BODY (text):')
      // Indent each line of the body so it's visually offset from the diagnostics
      const indentedBody = hook.body_text.split('\n').map((l) => '    ' + l).join('\n')
      console.log(indentedBody)
      console.log('  ──')
      console.log(`  body_html: ${hook.body_html.length} chars`)
      console.log(`  hook_style: ${hook.hook_style}`)
      console.log(`  model: ${hook.model}`)
      console.log(`  tokens: ${hook.tokens_used}`)
      console.log()

      // Rate limit: Claude API ~60 RPM, give it a small breath
      await new Promise((r) => setTimeout(r, 1100))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${mock.business_name}: ${msg}`)
      console.error(`  ERROR: ${msg}\n`)
    }
  }

  console.log('══════════════════════════════════════════════')
  console.log(`  DRY-RUN COMPLETE`)
  console.log(`  hooks generated: ${succeeded}/${mocksToProcess.length}`)
  console.log(`  tokens used: ${totalTokens}`)
  console.log(`  errors: ${errors.length}`)
  if (errors.length > 0) {
    for (const e of errors) console.log(`    - ${e}`)
  }
  console.log('  No emails sent. No DB writes. No external scrapes.')
  console.log('  Tone audit: read each SUBJECT and BODY block above.')
  console.log('══════════════════════════════════════════════\n')
}

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

// ─── Limit-aware batch sizing ─────────────────────────────
//
// When --limit is set (especially in --once mode where the runSwarm-level
// limit-break is unreachable), each stage's batch size is capped to the
// limit. This guarantees that a single cycle cannot exceed the configured
// limit at ANY stage, not just the send stage. The previous behavior was a
// foot-gun: --once --limit 10 would scrape up to 180 places, enrich up to 50,
// mirror up to 20, and send up to 50, because the limit check was only
// evaluated in the (skipped) continuous loop.
//
// For the scraper, the cap also forces scrapeBatchSize down to 1 when limit
// is small, since otherwise scrapeBatchSize × maxPerTarget can still exceed
// limit (e.g. 3 city pairs × 10 max each = 30 results for limit=10).
//
// Returns the effective batch sizes that runCycle should use.

interface EffectiveBatches {
  scrapeBatchSize: number
  maxPerTarget: number
  enrichBatchSize: number
  mirrorBatchSize: number
  sendBatchSize: number
}

export function deriveEffectiveBatches(opts: SwarmOptions): EffectiveBatches {
  const limit = opts.limit
  const cap = (configured: number | undefined, defaultVal: number): number => {
    const base = configured ?? defaultVal
    if (limit === undefined) return base
    return Math.min(base, limit)
  }

  // Scraper is special: scrapeBatchSize counts city/category pairs, not
  // results. To bound total results at <= limit, force pairs=1 when limit is
  // set and cap maxPerTarget at limit.
  const scrapeBatchSize = limit !== undefined ? 1 : (opts.scrapeBatchSize ?? 3)
  const maxPerTarget = cap(opts.maxPerTarget, 60)

  return {
    scrapeBatchSize,
    maxPerTarget,
    enrichBatchSize: cap(opts.enrichBatchSize, 50),
    mirrorBatchSize: cap(opts.mirrorBatchSize, 20),
    sendBatchSize: cap(opts.sendBatchSize, 50),
  }
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

  // Derive limit-capped effective batch sizes for every stage. This is the
  // fix for the --limit foot-gun: --once --limit 10 now actually limits each
  // stage to at most 10, instead of running each stage at its default batch
  // size and never checking the limit.
  const batches = deriveEffectiveBatches(opts)

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║         EMAIL SWARM — CYCLE START        ║')
  console.log(`║   ${new Date().toISOString()}`)
  console.log(`║   mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (opts.limit !== undefined) {
    console.log(`║   limit: ${opts.limit} (caps every stage batch)`)
  }
  console.log(`║   batches: scrape=${batches.scrapeBatchSize}×${batches.maxPerTarget} enrich=${batches.enrichBatchSize} mirror=${batches.mirrorBatchSize} send=${batches.sendBatchSize}`)
  console.log('╚══════════════════════════════════════════╝')

  try {
    // ── Step 1: SCRAPE ──────────────────────────────────
    if (!opts.enrichOnly && !opts.mirrorOnly && !opts.sendOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 1: SCRAPE ──')
      const targets = opts.targets || DEFAULT_TARGETS

      // Pick a slice of targets for this cycle (capped by limit-aware batch)
      const cycleTargets = targets.slice(0, batches.scrapeBatchSize)

      const scrapeResult = await scrapeBatch({
        targets: cycleTargets,
        radius: opts.scrapeRadius,
        maxPerTarget: batches.maxPerTarget,
        dryRun: opts.dryRun,
      })

      result.scraped = scrapeResult.scraped
      result.errors.push(...scrapeResult.errors)
    }

    // ── Step 2: ENRICH ──────────────────────────────────
    if (!opts.scrapeOnly && !opts.mirrorOnly && !opts.sendOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 2: ENRICH ──')
      const enrichResult = await enrichTargets({
        batchSize: batches.enrichBatchSize,
        dryRun: opts.dryRun,
      })

      result.enriched = enrichResult.enriched
      result.errors.push(...enrichResult.errors)
    }

    // ── Step 3: MIRROR ──────────────────────────────────
    if (!opts.scrapeOnly && !opts.enrichOnly && !opts.sendOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 3: MIRROR ──')
      const mirrorResult = await generateMirrorHooks({
        batchSize: batches.mirrorBatchSize,
        dryRun: opts.dryRun,
      })

      result.mirrored = mirrorResult.generated
      result.errors.push(...mirrorResult.errors)
    }

    // ── Step 4: SEND ────────────────────────────────────
    if (!opts.scrapeOnly && !opts.enrichOnly && !opts.mirrorOnly && !opts.monitorOnly) {
      console.log('\n  ── STEP 4: SEND ──')
      const sendResult = await sendBatch({
        batchSize: batches.sendBatchSize,
        dryRun: opts.dryRun,
      })

      result.sent = sendResult.sent
    }

    // ── Step 5: MONITOR ─────────────────────────────────
    if (!opts.scrapeOnly && !opts.enrichOnly && !opts.mirrorOnly && !opts.sendOnly) {
      console.log('\n  ── STEP 5: MONITOR ──')
      const monitorResult = await runMonitorCycle({ dryRun: opts.dryRun })

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
  // DRY-RUN: bypass the live pipeline entirely. The mock pipeline does not
  // touch Google Places, scrape websites, query Supabase, or hit SES. It
  // only calls the Claude API to generate ~10 hooks against in-memory mock
  // targets and prints them. This is the only path for tone audits.
  if (opts.dryRun) {
    await runDryRunMockPipeline(opts)
    return
  }

  const cycleInterval = opts.cycleIntervalMs || 60000
  let totalSent = 0
  const limit = opts.limit || Infinity

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║         EMAIL SWARM — ENGINE START       ║')
  console.log('║                                          ║')
  console.log('║   scrape → enrich → mirror → send → mon ║')
  console.log(`║   cycle interval: ${cycleInterval / 1000}s`)
  console.log(`║   limit: ${limit === Infinity ? 'unlimited' : limit}`)
  console.log(`║   mode: LIVE FIRE`)
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
