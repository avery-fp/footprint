#!/usr/bin/env node
/**
 * ARO Operator — state-machine publisher for footprint.onl
 *
 * Lifecycle:  IDLE → FETCH → NAVIGATE → TYPE → AWAIT_CONFIRM → REPORT → IDLE
 *
 * Polls /api/aro/publish for the next queued seed, drives Chrome via
 * pinchtab, types the copy, then waits for human confirmation before
 * marking the seed as sent.
 *
 * Usage:
 *   CRON_SECRET=xxx node operator.js
 *   CRON_SECRET=xxx VERCEL_URL=https://staging.footprint.onl node operator.js
 */

const { execFile } = require("child_process");
const readline = require("readline");

// ─── Config ──────────────────────────────────────────────────

const BASE_URL =
  process.env.VERCEL_URL || "https://www.footprint.onl";
const PUBLISH_ENDPOINT = `${BASE_URL}/api/aro/publish`;
const SECRET = process.env.CRON_SECRET;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 300_000; // 5 min
const PAGE_LOAD_MS = Number(process.env.PAGE_LOAD_MS) || 5_000;
const MAX_CONSECUTIVE_ERRORS = 5;
const BACKOFF_BASE_MS = 30_000; // 30s → 60s → 120s …

// ─── State ───────────────────────────────────────────────────

/** @type {'IDLE'|'FETCH'|'NAVIGATE'|'TYPE'|'AWAIT_CONFIRM'|'REPORT'|'COOLDOWN'} */
let state = "IDLE";
let consecutiveErrors = 0;
let pollTimer = null;
let shuttingDown = false;

// ─── Helpers ─────────────────────────────────────────────────

function log(icon, ...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${ts} ${icon}`, ...args);
}

function pt(args, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "pinchtab",
      args,
      {
        env: {
          ...process.env,
          BRIDGE_TOKEN: "fidelio",
          BRIDGE_URL: "http://127.0.0.1:9867",
        },
        timeout: timeoutMs,
      },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      }
    );
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function askHuman(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ─── State machine ───────────────────────────────────────────

async function tick() {
  if (shuttingDown) return;

  state = "FETCH";
  log("📡", `[FETCH] Polling brain… (errors: ${consecutiveErrors})`);

  let seed;
  try {
    const res = await fetch(PUBLISH_ENDPOINT, {
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 204) {
      const body = await res.json().catch(() => ({}));
      log("💤", `[IDLE] ${body.reason || "pacing"}`);
      consecutiveErrors = 0;
      state = "IDLE";
      return;
    }

    if (res.status === 401) {
      log("🔒", "[FATAL] CRON_SECRET rejected. Check env.");
      shutdown(1);
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    seed = await res.json();
    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    const backoff = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, consecutiveErrors - 1),
      600_000
    );
    log(
      "⚠️",
      `[ERROR] Fetch failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err.message}`
    );

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log("🛑", "[FATAL] Too many consecutive errors. Stopping.");
      shutdown(1);
      return;
    }

    log("⏳", `[COOLDOWN] Backing off ${(backoff / 1000).toFixed(0)}s…`);
    state = "COOLDOWN";
    await sleep(backoff);
    state = "IDLE";
    return;
  }

  const { id, surface_url, copy_text } = seed;

  if (!id || !surface_url || !copy_text) {
    log("⚠️", "[ERROR] Malformed seed — missing id/surface_url/copy_text:", JSON.stringify(seed));
    return;
  }

  // ─── Navigate ────────────────────────────────────────────
  state = "NAVIGATE";
  log("🌐", `[NAV] ${surface_url}`);

  try {
    await pt(["nav", surface_url]);
    await sleep(PAGE_LOAD_MS);
  } catch (err) {
    log("⚠️", `[NAV ERROR] ${err.message} — skipping seed ${id}`);
    return;
  }

  // ─── Auto-detect input & type ────────────────────────────
  state = "TYPE";
  try {
    const snap = await pt(["snap", "-i", "-c"]);
    const ref = snap.match(/(e\d+)/)?.[1] ?? "e1";
    log("⌨️", `[TYPE] ref=${ref}, copy="${copy_text.slice(0, 50)}…"`);
    await pt(["type", ref, copy_text], 10_000);
  } catch (err) {
    log("⚠️", `[TYPE ERROR] ${err.message} — skipping seed ${id}`);
    return;
  }

  // ─── Await human confirmation ────────────────────────────
  state = "AWAIT_CONFIRM";
  log("──────────────────────────────────────────────────");
  log("👁️", "Message typed in Chrome.");
  log("", `  URL:  ${surface_url}`);
  log("", `  Copy: ${copy_text}`);
  log("──────────────────────────────────────────────────");

  const answer = await askHuman(
    "  Press ENTER after posting (or type 'skip' to skip): "
  );

  if (answer === "skip" || answer === "s") {
    log("⏭️", `[SKIP] Seed ${id} skipped by operator.`);
    return;
  }

  // ─── Report sent ─────────────────────────────────────────
  state = "REPORT";
  try {
    const res = await fetch(`${PUBLISH_ENDPOINT}/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      log("⚠️", `[REPORT ERROR] PATCH returned ${res.status}`);
    } else {
      log("✅", `[SENT] Seed ${id} logged. Next cycle in ${POLL_INTERVAL_MS / 1000}s.`);
    }
  } catch (err) {
    log("⚠️", `[REPORT ERROR] ${err.message} — seed ${id} may need manual mark.`);
  }

  state = "IDLE";
}

// ─── Main loop ───────────────────────────────────────────────

async function run() {
  if (!SECRET) {
    log("🛑", "[FATAL] CRON_SECRET not set. Export it before running.");
    process.exit(1);
  }

  log("🧠", `ARO Operator online.`);
  log("", `  Endpoint: ${PUBLISH_ENDPOINT}`);
  log("", `  Interval: ${POLL_INTERVAL_MS / 1000}s`);
  log("", `  State:    ${state}`);
  log("──────────────────────────────────────────────────");

  // First tick immediately
  await tick();

  // Then poll on interval
  pollTimer = setInterval(async () => {
    if (state !== "IDLE" && state !== "COOLDOWN") {
      log("⏸️", `[BUSY] State=${state}, skipping poll.`);
      return;
    }
    await tick();
  }, POLL_INTERVAL_MS);
}

// ─── Graceful shutdown ───────────────────────────────────────

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("👋", "[SHUTDOWN] Operator stopping…");
  if (pollTimer) clearInterval(pollTimer);
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run();
