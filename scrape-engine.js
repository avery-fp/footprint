#!/usr/bin/env node
/**
 * Footprint Scrape Engine — Node entry point
 *
 * Contact sourcing from cultural clusters using twscrape + instaloader.
 * Replaces Apollo. No credit limit. No monthly cap.
 *
 * Usage:
 *   node scrape-engine.js --config clusters.json
 *   node scrape-engine.js --config clusters.json --platform twitter
 *   node scrape-engine.js --config clusters.json --max-per-seed 10000 --resume
 *
 * Environment variables:
 *   INSTA_USER          — Instagram username for follower list access
 *   INSTA_PASS          — Instagram password
 *   TWITTER_ACCOUNTS_FILE — Path to twitter accounts pool file
 *
 * Setup:
 *   pip install -r scrape-engine/requirements.txt
 */

const { spawn } = require("child_process");
const path = require("path");

const ENGINE = path.join(__dirname, "scrape-engine", "engine.py");

// Forward all CLI args to the Python engine
const args = process.argv.slice(2);

// If no args, show help
if (args.length === 0) {
  console.log(`
Footprint Scrape Engine — Contact sourcing from cultural clusters

Usage:
  node scrape-engine.js --config <clusters.json> [options]

Options:
  --config <path>          Cluster config JSON (required)
  --output <dir>           Output directory (default: ./output/scrape)
  --platform <p>           twitter | instagram | both (default: both)
  --max-per-seed <n>       Max followers per seed (default: 5000)
  --resume                 Resume from previous run
  --twitter-accounts <f>   Twitter accounts file
  --ig-session <f>         Instaloader session file
  --min-followers <n>      Min follower count (default: 1000)
  --max-followers <n>      Max follower count (default: 50000)

Config format:
  {
    "hip-hop": ["@XXL", "@hotnewhiphop", "@complexmusic"],
    "fashion": ["@highsnobiety", "@hypebeast"],
    "mixed":   ["tw:@account", "ig:@account"]
  }

Platform prefixes in config:
  tw: or twitter:   — force Twitter scraping
  ig: or instagram: — force Instagram scraping
  (no prefix)       — uses --platform flag

Environment:
  INSTA_USER / INSTA_PASS       — Instagram login
  TWITTER_ACCOUNTS_FILE         — Twitter account pool

Setup:
  pip install -r scrape-engine/requirements.txt
  `);
  process.exit(0);
}

// Resolve python executable
const python = process.env.PYTHON || "python3";

const proc = spawn(python, [ENGINE, ...args], {
  stdio: "inherit",
  env: { ...process.env },
  cwd: __dirname,
});

proc.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error(
      `Error: ${python} not found. Install Python 3.10+ and run:\n` +
      `  pip install -r scrape-engine/requirements.txt`
    );
  } else {
    console.error("Scrape engine error:", err.message);
  }
  process.exit(1);
});

proc.on("exit", (code) => {
  process.exit(code || 0);
});
