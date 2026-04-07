#!/usr/bin/env npx tsx
/**
 * CLI entry point for the Email Swarm.
 *
 * Usage:
 *   npm run aro:swarm                        # full pipeline, continuous
 *   npm run aro:swarm -- --dry-run            # full pipeline, no sending
 *   npm run aro:swarm -- --once               # single cycle
 *   npm run aro:swarm -- --scrape-only        # just scrape Google Maps
 *   npm run aro:swarm -- --enrich-only        # just enrich emails
 *   npm run aro:swarm -- --mirror-only        # just generate hooks
 *   npm run aro:swarm -- --send-only          # just send queued emails
 *   npm run aro:swarm -- --monitor-only       # just run monitor check
 *   npm run aro:swarm -- --limit 100          # stop after 100 sends
 *   npm run aro:swarm -- --help
 */

import { runSwarm, type SwarmOptions } from '../src/aro/swarm'

function parseArgs(): SwarmOptions & { help: boolean } {
  const args = process.argv.slice(2)
  const opts: SwarmOptions & { help: boolean } = { help: false }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        opts.dryRun = true
        break
      case '--once':
        opts.once = true
        break
      case '--scrape-only':
        opts.scrapeOnly = true
        opts.once = true
        break
      case '--enrich-only':
        opts.enrichOnly = true
        opts.once = true
        break
      case '--mirror-only':
        opts.mirrorOnly = true
        opts.once = true
        break
      case '--send-only':
        opts.sendOnly = true
        opts.once = true
        break
      case '--monitor-only':
        opts.monitorOnly = true
        opts.once = true
        break
      case '--limit':
        opts.limit = parseInt(args[++i], 10) || 100
        break
      case '--scrape-batch':
        opts.scrapeBatchSize = parseInt(args[++i], 10) || 3
        break
      case '--enrich-batch':
        opts.enrichBatchSize = parseInt(args[++i], 10) || 50
        break
      case '--mirror-batch':
        opts.mirrorBatchSize = parseInt(args[++i], 10) || 20
        break
      case '--send-batch':
        opts.sendBatchSize = parseInt(args[++i], 10) || 50
        break
      case '--interval':
        opts.cycleIntervalMs = parseInt(args[++i], 10) * 1000 || 60000
        break
      case '--radius':
        opts.scrapeRadius = parseInt(args[++i], 10) || 50000
        break
      case '--help':
      case '-h':
        opts.help = true
        break
    }
  }

  return opts
}

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║               EMAIL SWARM CLI                        ║
║   Google Maps → Mirror Hook → SES Send → Monitor     ║
╚══════════════════════════════════════════════════════╝

Usage:
  npm run aro:swarm [options]

Pipeline modes:
  (default)           Full pipeline, continuous loop
  --once              Single cycle, then exit
  --scrape-only       Only scrape Google Maps targets
  --enrich-only       Only enrich scraped targets with emails
  --mirror-only       Only generate LLM mirror hooks
  --send-only         Only send queued emails
  --monitor-only      Only run domain health check

Safety:
  --dry-run           Print what would happen, don't execute
  --limit <n>         Stop after N total emails sent

Batch sizes:
  --scrape-batch <n>  City/category pairs per cycle (default: 3)
  --enrich-batch <n>  Targets to enrich per cycle (default: 50)
  --mirror-batch <n>  Hooks to generate per cycle (default: 20)
  --send-batch <n>    Emails to send per cycle (default: 50)

Timing:
  --interval <sec>    Seconds between cycles (default: 60)
  --radius <m>        Scrape radius in meters (default: 50000)

Environment variables:
  GOOGLE_PLACES_API_KEY     Google Maps Places API key
  ANTHROPIC_API_KEY         Claude API key (for mirror hooks)
  AWS_SES_REGION_N          SES region (1-5)
  AWS_SES_ACCESS_KEY_N      SES access key
  AWS_SES_SECRET_KEY_N      SES secret key
  AWS_SES_FROM_N            SES from address
  AWS_SES_DOMAIN_N          SES sending domain
  RESEND_API_KEY            Resend fallback key
  SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Supabase service role key
`)
}

async function main() {
  const opts = parseArgs()

  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  // Validate minimum config.
  //
  // Dry-run mode runs the mock pipeline (src/aro/swarm.ts → runDryRunMockPipeline)
  // which DOES NOT touch Supabase, Google Places, SES, or website scraping.
  // The only external dependency is Claude (for hook generation), so dry-run
  // requires only ANTHROPIC_API_KEY.
  //
  // Live mode requires Supabase (DB), Google Places (scraping), Anthropic
  // (hook generation), and at least one of SES or Resend (sending).
  const missing: string[] = []

  if (!process.env.ANTHROPIC_API_KEY) {
    missing.push('ANTHROPIC_API_KEY')
  }

  if (!opts.dryRun) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
      missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      missing.push('SUPABASE_SERVICE_ROLE_KEY')
    }
  }

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    if (opts.dryRun) {
      console.error('Dry-run mode requires ANTHROPIC_API_KEY only.')
    } else {
      console.error('Set these in .env or run with --dry-run for tone audit only.')
    }
    process.exit(1)
  }

  // Run the swarm
  await runSwarm(opts)
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
