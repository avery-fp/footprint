/**
 * CLI driver — the actual logic behind culture.mjs.
 * Parses args, validates env, runs the right pipeline mode.
 */

import { validateEnv } from './env.js'
import { runPipeline, mintSingle } from './pipeline/autoMint.js'
import { analyze } from './agents/darwin.js'

// ─── Parse CLI args ─────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {
    mode: 'auto',
    count: 5,
    noun: '',
    dry_run: false,
    skip_screenshots: false,
    skip_deploy: false,
  }

  // First positional arg is the mode
  if (args[0] && !args[0].startsWith('--')) {
    parsed.mode = args[0]
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--count':
        parsed.count = parseInt(args[++i], 10) || 5
        break
      case '--noun':
        parsed.noun = args[++i] || ''
        break
      case '--dry-run':
        parsed.dry_run = true
        break
      case '--skip-screenshots':
        parsed.skip_screenshots = true
        break
      case '--skip-deploy':
        parsed.skip_deploy = true
        break
      case '--mode':
        parsed.mode = args[++i] || 'auto'
        break
    }
  }

  return parsed
}

// ─── Main ───────────────────────────────────────────────

export async function main() {
  const args = parseArgs()

  console.log(`
╔══════════════════════════════════════════╗
║         FOOTPRINT CULTURE ENGINE         ║
║     autonomous distribution pipeline     ║
╚══════════════════════════════════════════╝
`)

  // Validate env
  try {
    validateEnv()
  } catch (err: any) {
    console.error(`\n✗ ${err.message}`)
    console.error('\nRequired env vars:')
    console.error('  BING_API_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET')
    console.error('  ANTHROPIC_API_KEY, ARO_KEY')
    console.error('\nOptional:')
    console.error('  FP_BASE_URL (default: https://footprint.onl)')
    process.exit(1)
  }

  const startTime = Date.now()

  switch (args.mode) {
    case 'mint': {
      if (!args.noun) {
        console.error('✗ --noun required for mint mode')
        console.error('  Usage: npm run fp:mint -- --noun "topic"')
        process.exit(1)
      }
      console.log(`Mode: SINGLE MINT`)
      console.log(`Noun: "${args.noun}"`)
      console.log()

      const result = await mintSingle(args.noun, {
        dry_run: args.dry_run,
        skip_screenshots: args.skip_screenshots,
        skip_deploy: args.skip_deploy,
      })

      if (result.error) {
        console.error(`\n✗ Failed: ${result.error}`)
        process.exit(1)
      }

      if (result.mint) {
        console.log(`\n✓ Minted: ${result.mint.room_url}`)
        console.log(`  Serial: #${result.mint.serial_number}`)
        console.log(`  Tiles: ${result.mint.tile_count}`)
      }
      break
    }

    case 'batch': {
      console.log(`Mode: BATCH`)
      console.log(`Count: ${args.count}`)
      console.log()

      const results = await runPipeline({
        mode: 'batch',
        count: args.count,
        dry_run: args.dry_run,
        skip_screenshots: args.skip_screenshots,
        skip_deploy: true, // Batch skips deploy by default
      })

      const minted = results.filter(r => r.mint)
      console.log(`\n✓ Batch complete: ${minted.length}/${results.length} minted`)
      minted.forEach(r => {
        if (r.mint) console.log(`  → ${r.mint.room_url}`)
      })
      break
    }

    case 'auto': {
      console.log(`Mode: FULL AUTONOMOUS`)
      console.log(`Count: ${args.count}`)
      console.log()

      const results = await runPipeline({
        mode: 'auto',
        count: args.count,
        dry_run: args.dry_run,
        skip_screenshots: args.skip_screenshots,
        skip_deploy: args.skip_deploy,
      })

      const minted = results.filter(r => r.mint)
      const deployed = results.filter(r => r.deployments?.length)
      console.log(`\n✓ Pipeline complete:`)
      console.log(`  Minted: ${minted.length}`)
      console.log(`  Deployed: ${deployed.length}`)
      minted.forEach(r => {
        if (r.mint) {
          const deploys = r.deployments?.length || 0
          console.log(`  → ${r.mint.room_url} (${deploys} deployments)`)
        }
      })
      break
    }

    case 'darwin': {
      console.log(`Mode: DARWIN ANALYSIS`)
      console.log()

      const feedback = await analyze(30)
      console.log(`\nDarwin Feedback:`)
      console.log(JSON.stringify(feedback, null, 2))
      break
    }

    default:
      console.error(`✗ Unknown mode: "${args.mode}"`)
      console.error('  Valid modes: auto, batch, mint, darwin')
      process.exit(1)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone in ${elapsed}s`)
}
