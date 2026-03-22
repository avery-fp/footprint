#!/usr/bin/env node
/**
 * Footprint Launch Orchestrator
 *
 * One command to rule them all:
 *   npm run launch
 *
 * Steps:
 *   1. Scrape (if CSVs don't exist or --fresh)
 *   2. Merge + dedupe all CSVs into lists/
 *   3. Sort by total_score descending
 *   4. Feed into send engine with subject lines + provider config
 *
 * Usage:
 *   node scripts/launch.js
 *   node scripts/launch.js --fresh          # re-scrape even if CSVs exist
 *   node scripts/launch.js --dry-run        # preview without sending
 *   node scripts/launch.js --skip-scrape    # skip scrape, just merge+send
 *   node scripts/launch.js --limit 500      # cap emails sent
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCRAPE_OUTPUT = path.join(ROOT, "output", "scrape");
const LISTS_DIR = path.join(ROOT, "lists");
const CLUSTERS_CONFIG = path.join(ROOT, "scrape-engine", "clusters.json");
const PROVIDER_CONFIG = path.join(ROOT, "provider-configs.json");
const CONFIG_DIR = path.join(ROOT, "config");

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const dryRun = args.includes("--dry-run");
const skipScrape = args.includes("--skip-scrape");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
    return true;
  } catch (err) {
    console.error(`Command failed: ${cmd}`);
    return false;
  }
}

function hasCSVs(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((f) => f.endsWith(".csv"));
}

// Simple CSV parser
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];
  const lines = raw.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = vals[i] || ""));
    return row;
  });
}

// ---------------------------------------------------------------------------
// Step 1: Scrape
// ---------------------------------------------------------------------------
function stepScrape() {
  console.log("\n" + "=".repeat(60));
  console.log("STEP 1: SCRAPE ENGINE");
  console.log("=".repeat(60));

  if (skipScrape) {
    console.log("Skipped (--skip-scrape)");
    return true;
  }

  if (!fresh && hasCSVs(SCRAPE_OUTPUT)) {
    console.log(`CSVs already exist in ${SCRAPE_OUTPUT}. Use --fresh to re-scrape.`);
    return true;
  }

  if (!fs.existsSync(CLUSTERS_CONFIG)) {
    console.error(`Clusters config not found: ${CLUSTERS_CONFIG}`);
    return false;
  }

  const scrapeCmd = [
    "node", path.join(ROOT, "scrape-engine.js"),
    "--config", CLUSTERS_CONFIG,
    "--output", SCRAPE_OUTPUT,
    "--resume",
  ].join(" ");

  return run(scrapeCmd);
}

// ---------------------------------------------------------------------------
// Step 2: Merge + Dedupe into lists/
// ---------------------------------------------------------------------------
function stepMerge() {
  console.log("\n" + "=".repeat(60));
  console.log("STEP 2: MERGE + DEDUPE → lists/");
  console.log("=".repeat(60));

  // Collect CSVs from output/scrape/
  const sources = [];
  if (fs.existsSync(SCRAPE_OUTPUT)) {
    const files = fs.readdirSync(SCRAPE_OUTPUT).filter((f) => f.endsWith(".csv"));
    sources.push(...files.map((f) => path.join(SCRAPE_OUTPUT, f)));
  }

  // Also include any manually-placed CSVs in lists/
  if (fs.existsSync(LISTS_DIR)) {
    const existing = fs.readdirSync(LISTS_DIR).filter(
      (f) => f.endsWith(".csv") && f !== "merged.csv"
    );
    sources.push(...existing.map((f) => path.join(LISTS_DIR, f)));
  }

  if (sources.length === 0) {
    console.log("No CSV files found. Scrape first or add CSVs to lists/");
    return false;
  }

  console.log(`Found ${sources.length} CSV files to merge`);

  // Parse all, dedupe by email (keep highest score), sort
  const best = new Map();
  let totalRows = 0;

  for (const file of sources) {
    const rows = parseCSV(file);
    totalRows += rows.length;
    for (const row of rows) {
      const email = (row.email || "").toLowerCase().trim();
      if (!email || !email.includes("@")) continue;
      const score = parseInt(row.total_score || "0", 10);
      const existing = best.get(email);
      if (!existing || score > parseInt(existing.total_score || "0", 10)) {
        best.set(email, { ...row, email, total_score: String(score) });
      }
    }
  }

  const sorted = Array.from(best.values()).sort(
    (a, b) => parseInt(b.total_score || "0", 10) - parseInt(a.total_score || "0", 10)
  );

  console.log(`Total rows: ${totalRows} → ${sorted.length} unique (deduped + sorted)`);

  // Write merged.csv to lists/
  fs.mkdirSync(LISTS_DIR, { recursive: true });
  const mergedPath = path.join(LISTS_DIR, "merged.csv");
  const headers = ["email", "name", "vertical", "source", "total_score"];
  const csvLines = [
    headers.join(","),
    ...sorted.map((r) => headers.map((h) => r[h] || "").join(",")),
  ];
  fs.writeFileSync(mergedPath, csvLines.join("\n") + "\n");

  console.log(`Wrote ${sorted.length} contacts to ${mergedPath}`);
  if (sorted.length > 0) {
    console.log(`Score range: ${sorted[0].total_score} → ${sorted[sorted.length - 1].total_score}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Step 3: Send
// ---------------------------------------------------------------------------
function stepSend() {
  console.log("\n" + "=".repeat(60));
  console.log("STEP 3: SEND ENGINE");
  console.log("=".repeat(60));

  const mergedCSV = path.join(LISTS_DIR, "merged.csv");
  if (!fs.existsSync(mergedCSV)) {
    console.error("No merged.csv found. Merge step failed?");
    return false;
  }

  // Build send command — point at lists/ dir which has merged.csv
  const sendArgs = [
    "node", path.join(ROOT, "send-engine.js"),
    "--lists", LISTS_DIR,
    "--config-dir", CONFIG_DIR,
  ];

  if (dryRun) sendArgs.push("--dry-run");
  if (limit) sendArgs.push("--limit", String(limit));
  if (fs.existsSync(PROVIDER_CONFIG)) {
    sendArgs.push("--providers", PROVIDER_CONFIG);
  } else if (!dryRun) {
    console.error(`Provider config not found: ${PROVIDER_CONFIG}`);
    console.error("Copy provider-configs.example.json → provider-configs.json and fill in credentials.");
    return false;
  }

  return run(sendArgs.join(" "));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log("=".repeat(60));
  console.log("FOOTPRINT LAUNCH ORCHESTRATOR");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (limit) console.log(`Limit: ${limit} emails`);
  if (fresh) console.log("Fresh scrape requested");

  const t0 = Date.now();

  // Step 1
  if (!stepScrape()) {
    console.error("\nScrape step failed. Fix issues above and re-run.");
    process.exit(1);
  }

  // Step 2
  if (!stepMerge()) {
    console.error("\nMerge step failed. Fix issues above and re-run.");
    process.exit(1);
  }

  // Step 3
  if (!stepSend()) {
    console.error("\nSend step failed. Fix issues above and re-run.");
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(60));
  console.log(`LAUNCH COMPLETE (${elapsed}s)`);
  console.log("=".repeat(60));
}

main();
