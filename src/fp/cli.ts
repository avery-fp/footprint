/**
 * CLI driver — the actual logic behind culture.mjs.
 */

import { validateEnv } from './env.js'
import { runPipeline, mintSingle } from './pipeline/autoMint.js'

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

export async function main() {
  const args = parseArgs()

  console.log(`
╔══════════════════════════════════════════╗
║         FOOTPRINT CULTURE ENGINE         ║
║     autonomous distribution pipeline     ║
╚══════════════════════════════════════════╝
`)

  try {
    validateEnv()
  } catch (err: any) {
    console.error(`\n✗ ${err.message}`)
    console.error('\nRequired env vars:')
    console.error('  UNSPLASH_ACCESS_KEY, BING_API_KEY')
    console.error('  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET')
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

    case 'batch':
    case 'auto': {
      await runPipeline({
        mode: args.mode as 'auto' | 'batch',
        count: args.count,
        dry_run: args.dry_run,
      })
      break
    }

    default:
      console.error(`✗ Unknown mode: "${args.mode}"`)
      console.error('  Available now: mint')
      console.error('  Coming soon: auto, batch, darwin')
      process.exit(1)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone in ${elapsed}s`)
}
