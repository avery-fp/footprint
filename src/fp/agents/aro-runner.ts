/**
 * ARO RUNNER — multi-account Reddit distribution orchestrator.
 *
 * Reads REDDIT_ACCOUNT_N_USERNAME / REDDIT_ACCOUNT_N_PASSWORD from env,
 * assigns subreddits across accounts, and runs one browser-poster loop
 * per account in parallel.
 *
 * Usage:
 *   npx tsx src/fp/agents/aro-runner.ts
 *   npx tsx src/fp/agents/aro-runner.ts --headless
 *   npx tsx src/fp/agents/aro-runner.ts --once
 */

import '../env.js'
import {
  loadRedditAccounts,
  assignSubreddits,
  runPoster,
  type RedditAccount,
  type BrowserPosterOptions,
} from './browser-poster.js'

// ─── Types ──────────────────────────────────────────────

interface RunnerOptions {
  headless?: boolean
  once?: boolean
  cycleInterval?: number // ms between cycles (default 5 min)
}

// ─── Single account loop ────────────────────────────────

async function accountLoop(
  account: RedditAccount,
  opts: RunnerOptions & BrowserPosterOptions
): Promise<void> {
  const label = account.username

  while (true) {
    console.log(`\n  [runner] ${label}: starting cycle (${account.assignedSubs.length} subs)`)

    try {
      const result = await runPoster(account, {
        headless: opts.headless,
      })

      console.log(`  [runner] ${label}: posted=${result.posted} failed=${result.failed} rateLimited=${result.rateLimited}`)

      if (result.rateLimited) {
        const cooldown = 120_000 + Math.random() * 60_000 // 2-3 min cooldown
        console.log(`  [runner] ${label}: rate limited, cooling down ${Math.round(cooldown / 1000)}s`)
        await sleep(cooldown)
      }
    } catch (err: any) {
      console.error(`  [runner] ${label}: cycle error: ${err.message}`)
    }

    if (opts.once) break

    const interval = opts.cycleInterval || 300_000 // 5 minutes
    console.log(`  [runner] ${label}: sleeping ${Math.round(interval / 1000)}s`)
    await sleep(interval)
  }
}

// ─── Main ───────────────────────────────────────────────

function parseArgs(): RunnerOptions {
  const args = process.argv.slice(2)
  return {
    headless: args.includes('--headless'),
    once: args.includes('--once'),
    cycleInterval: (() => {
      const idx = args.indexOf('--interval')
      if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10) * 1000
      return undefined
    })(),
  }
}

async function main(): Promise<void> {
  const opts = parseArgs()

  console.log(`
╔══════════════════════════════════════════╗
║       ARO RUNNER — MULTI-ACCOUNT        ║
║     parallel browser-based posting      ║
╚══════════════════════════════════════════╝
`)

  // Load accounts from env
  const accounts = loadRedditAccounts()

  if (accounts.length === 0) {
    console.error('  No Reddit accounts found in env.')
    console.error('  Set REDDIT_ACCOUNT_1_USERNAME and REDDIT_ACCOUNT_1_PASSWORD in .env.local')
    console.error('  Format: REDDIT_ACCOUNT_N_USERNAME / REDDIT_ACCOUNT_N_PASSWORD')
    process.exit(1)
  }

  // Assign subreddits across accounts
  assignSubreddits(accounts)

  console.log(`  Accounts: ${accounts.length}`)
  console.log(`  Mode: ${opts.once ? 'SINGLE CYCLE' : 'CONTINUOUS'}`)
  console.log(`  Headless: ${opts.headless ? 'yes' : 'no (first run = manual login)'}`)
  console.log()

  for (const account of accounts) {
    console.log(`  ${account.username}:`)
    console.log(`    profile: ${account.profileDir}`)
    console.log(`    subs (${account.assignedSubs.length}): ${account.assignedSubs.slice(0, 8).join(', ')}${account.assignedSubs.length > 8 ? '...' : ''}`)
  }

  // Graceful shutdown
  let running = true
  const shutdown = () => {
    console.log('\n  [runner] shutting down...')
    running = false
    // Give browsers time to close
    setTimeout(() => process.exit(0), 5000)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Launch one loop per account in parallel
  console.log(`\n  [runner] launching ${accounts.length} parallel poster loops...`)

  const loops = accounts.map(account =>
    accountLoop(account, opts).catch(err => {
      console.error(`  [runner] ${account.username}: fatal error: ${err.message}`)
    })
  )

  await Promise.all(loops)

  console.log('\n  [runner] all loops finished')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(err => {
  console.error('Runner failed:', err)
  process.exit(1)
})
