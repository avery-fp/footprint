#!/usr/bin/env node
/**
 * Footprint Launch Summary — read send logs and output daily metrics.
 *
 * Usage:
 *   node scripts/launch-summary.js
 *   node scripts/launch-summary.js --dir output/logs
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const logDir = dirIdx >= 0
  ? args[dirIdx + 1]
  : path.join(__dirname, "..", "output", "logs");

if (!fs.existsSync(logDir)) {
  console.log("No logs found. Run a send first.");
  process.exit(0);
}

const files = fs.readdirSync(logDir)
  .filter((f) => f.startsWith("send-") && f.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.log("No send logs found.");
  process.exit(0);
}

let totalSent = 0;
let totalErrors = 0;
let totalAttempts = 0;
const clusterCounts = {};
const subjectCounts = {};
const providerCounts = {};

for (const file of files) {
  try {
    const entry = JSON.parse(fs.readFileSync(path.join(logDir, file), "utf-8"));
    totalSent += entry.sent || 0;
    totalErrors += entry.errors || 0;
    totalAttempts += entry.total || 0;

    if (entry.topClusters) {
      for (const [cluster, count] of entry.topClusters) {
        clusterCounts[cluster] = (clusterCounts[cluster] || 0) + count;
      }
    }
    if (entry.topSubjects) {
      for (const [subject, count] of entry.topSubjects) {
        subjectCounts[subject] = (subjectCounts[subject] || 0) + count;
      }
    }
    if (entry.providers) {
      for (const p of entry.providers) {
        providerCounts[p] = (providerCounts[p] || 0) + 1;
      }
    }
  } catch {
    console.warn(`  Skipped malformed log: ${file}`);
  }
}

const topClusters = Object.entries(clusterCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
const topSubjects = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

console.log("=".repeat(60));
console.log("FOOTPRINT LAUNCH SUMMARY");
console.log("=".repeat(60));
console.log(`Log files:        ${files.length}`);
console.log(`Total attempts:   ${totalAttempts}`);
console.log(`Total sent:       ${totalSent}`);
console.log(`Total errors:     ${totalErrors}`);
console.log(`Success rate:     ${totalAttempts > 0 ? ((totalSent / totalAttempts) * 100).toFixed(1) : 0}%`);
console.log("");
console.log("Top clusters by volume:");
for (const [c, n] of topClusters) {
  console.log(`  ${c}: ${n}`);
}
console.log("");
console.log("Top subject lines:");
for (const [s, n] of topSubjects) {
  console.log(`  "${s}": ${n}`);
}
console.log("");
console.log("Providers used:");
for (const [p, n] of Object.entries(providerCounts)) {
  console.log(`  ${p}: ${n} runs`);
}
console.log("=".repeat(60));
