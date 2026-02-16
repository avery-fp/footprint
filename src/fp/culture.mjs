#!/usr/bin/env node

/**
 * CULTURE — CLI entrypoint for the footprint autonomous pipeline.
 *
 * Usage (via npm scripts):
 *   npm run fp:auto                   — full autonomous loop (scan → mint → deploy)
 *   npm run fp:batch -- --count 20    — batch mint 20 rooms from trends
 *   npm run fp:mint -- --noun "drake" — mint a single room for a noun
 *   npm run fp:darwin                 — run darwin analysis
 *
 * Direct usage:
 *   npx tsx src/fp/culture.mjs auto
 *   npx tsx src/fp/culture.mjs batch --count 20
 *   npx tsx src/fp/culture.mjs mint --noun "japanese streetwear"
 *   npx tsx src/fp/culture.mjs darwin
 *
 * Env vars: BING_API_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET,
 *           ANTHROPIC_API_KEY, ARO_KEY
 *
 * Optional: FP_BASE_URL (default: https://footprint.onl)
 */

// Dynamic import to let tsx resolve .ts files at runtime
const { main } = await import('./cli.ts')

main().catch(err => {
  console.error(`\n✗ Fatal error: ${err.message}`)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
