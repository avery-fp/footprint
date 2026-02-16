#!/usr/bin/env node

/**
 * CULTURE — CLI entrypoint for the footprint autonomous pipeline.
 *
 * Usage:
 *   npm run fp:mint -- --noun "NBA All-Star 2026"
 *   npm run fp:mint -- --noun "japanese streetwear" --dry-run
 */

const { main } = await import('./cli.ts')

main().catch(err => {
  console.error(`\n✗ Fatal error: ${err.message}`)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
