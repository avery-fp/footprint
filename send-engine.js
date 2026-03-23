#!/usr/bin/env node
/**
 * Footprint Send Engine — Score-sorted bulk email delivery
 *
 * Reads CSVs with total_score column, sorts ALL contacts across ALL files
 * by score descending, sends highest-value contacts first.
 *
 * Supports multi-region SES + Resend round-robin.
 * Cluster-specific subject lines from config/subject-lines.json.
 *
 * Usage:
 *   node send-engine.js --lists ./lists --providers provider-configs.json
 *   node send-engine.js --lists ./lists --dry-run
 *   node send-engine.js --lists ./lists --limit 1000
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CSV parser (zero-dep)
// ---------------------------------------------------------------------------
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
// Load all CSVs from a directory, merge, dedupe, sort by total_score
// ---------------------------------------------------------------------------
function loadAndSort(listsDir) {
  const csvFiles = fs
    .readdirSync(listsDir)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => path.join(listsDir, f));

  if (csvFiles.length === 0) {
    console.error(`No CSV files found in ${listsDir}`);
    process.exit(1);
  }

  console.log(`Loading ${csvFiles.length} CSV files from ${listsDir}`);

  const requiredColumns = ["email", "total_score"];
  const allRows = [];
  for (const file of csvFiles) {
    const rows = parseCSV(file);
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      const missing = requiredColumns.filter((c) => !cols.includes(c));
      if (missing.length > 0) {
        console.error(`  ${path.basename(file)}: MISSING COLUMNS: ${missing.join(", ")}`);
        console.error(`  Found columns: ${cols.join(", ")}`);
        process.exit(1);
      }
    }
    console.log(`  ${path.basename(file)}: ${rows.length} contacts`);
    allRows.push(...rows);
  }

  // Deduplicate by email — keep highest score
  const best = new Map();
  for (const row of allRows) {
    const email = (row.email || "").toLowerCase().trim();
    if (!email) continue;
    const score = parseInt(row.total_score || "0", 10);
    const existing = best.get(email);
    if (!existing || score > parseInt(existing.total_score || "0", 10)) {
      best.set(email, { ...row, email, total_score: String(score) });
    }
  }

  // Sort descending by total_score
  const sorted = Array.from(best.values()).sort(
    (a, b) => parseInt(b.total_score || "0", 10) - parseInt(a.total_score || "0", 10)
  );

  console.log(`\nMerged: ${allRows.length} total → ${sorted.length} unique (deduped)`);
  if (sorted.length > 0) {
    console.log(`Score range: ${sorted[0].total_score} (top) → ${sorted[sorted.length - 1].total_score} (bottom)`);
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Provider initialization
// ---------------------------------------------------------------------------
function loadProviders(configPath) {
  if (!fs.existsSync(configPath)) {
    console.error(`Provider config not found: ${configPath}`);
    console.error("Create provider-configs.json — see provider-configs.example.json");
    process.exit(1);
  }

  const configs = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const providers = [];

  for (const cfg of configs) {
    if (cfg.provider === "ses") {
      // Multi-region SES — each entry gets its own client
      let SESClient, SendEmailCommand;
      try {
        ({ SESClient, SendEmailCommand } = require("@aws-sdk/client-ses"));
      } catch {
        console.error("@aws-sdk/client-ses not installed. Run: npm install @aws-sdk/client-ses");
        process.exit(1);
      }

      const client = new SESClient({
        region: cfg.region || "us-east-1",
        credentials: cfg.accessKeyId
          ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
          : undefined, // falls back to env/instance role
      });

      providers.push({
        name: cfg.name || `ses-${cfg.region}`,
        type: "ses",
        from: cfg.from,
        send: async (to, subject, html) => {
          const cmd = new SendEmailCommand({
            Source: cfg.from,
            Destination: { ToAddresses: [to] },
            Message: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: { Html: { Data: html, Charset: "UTF-8" } },
            },
          });
          return client.send(cmd);
        },
      });
      console.log(`  Loaded SES provider: ${cfg.name} (${cfg.region})`);

    } else if (cfg.provider === "resend") {
      let Resend;
      try {
        ({ Resend } = require("resend"));
      } catch {
        console.error("resend not installed. Run: npm install resend");
        process.exit(1);
      }

      const resend = new Resend(cfg.apiKey);

      providers.push({
        name: cfg.name || "resend",
        type: "resend",
        from: cfg.from,
        send: async (to, subject, html) => {
          return resend.emails.send({
            from: cfg.from,
            to,
            subject,
            html,
          });
        },
      });
      console.log(`  Loaded Resend provider: ${cfg.name}`);
    }
  }

  if (providers.length === 0) {
    console.error("No valid providers in config");
    process.exit(1);
  }

  return providers;
}

// ---------------------------------------------------------------------------
// Subject line resolution
// ---------------------------------------------------------------------------
function loadSubjectLines(configDir) {
  const filePath = path.join(configDir, "subject-lines.json");
  if (!fs.existsSync(filePath)) {
    console.warn("No subject-lines.json found. Using default.");
    return { default: "all of you. one place. $10." };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function resolveSubject(vertical, subjectLines) {
  if (!vertical) return subjectLines.default || "all of you. one place. $10.";
  // Exact match
  if (subjectLines[vertical]) return subjectLines[vertical];
  // Try parent cluster (e.g., "hip-hop-us_twitter" → "hip-hop-us")
  const base = vertical.replace(/_(twitter|instagram)$/, "");
  if (subjectLines[base]) return subjectLines[base];
  // Try broader match (e.g., "hip-hop-us" → any key starting with "hip-hop")
  const prefix = base.split("-").slice(0, 2).join("-");
  const match = Object.keys(subjectLines).find((k) => k.startsWith(prefix));
  if (match) return subjectLines[match];
  return subjectLines.default || "all of you. one place. $10.";
}

// ---------------------------------------------------------------------------
// Email template
// ---------------------------------------------------------------------------
function buildEmail(contact) {
  const name = contact.name || "there";
  const firstName = name.split(" ")[0];
  return `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#1a1a1a;">
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">hey ${firstName},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">footprint is a single-page site for everything you are — music, visuals, links, merch, shows — all in one place. $10, once, yours forever.</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">no algorithms. no followers. just you.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;"><a href="https://www.footprint.onl/api/track?cluster=${contact.vertical || "unknown"}&source=email" style="color:#1a1a1a;text-decoration:underline;">see what it looks like →</a></p>
<p style="margin:0;font-size:13px;color:#999;">— footprint</p>
</div>`;
}

// ---------------------------------------------------------------------------
// Send loop
// ---------------------------------------------------------------------------
async function sendAll(contacts, providers, subjectLines, opts) {
  const { dryRun, limit, delayMs } = opts;
  const total = limit ? Math.min(contacts.length, limit) : contacts.length;
  let sent = 0;
  let errors = 0;
  let providerIdx = 0;

  console.log(`\nSending to ${total} contacts (${dryRun ? "DRY RUN" : "LIVE"})...`);

  for (let i = 0; i < total; i++) {
    const contact = contacts[i];
    const subject = resolveSubject(contact.vertical, subjectLines);
    const html = buildEmail(contact);
    const provider = providers[providerIdx % providers.length];
    providerIdx++;

    if (dryRun) {
      console.log(
        `  [DRY] #${i + 1} → ${contact.email} | score:${contact.total_score} | ` +
        `subject:"${subject}" | via:${provider.name}`
      );
      sent++;
      continue;
    }

    try {
      await provider.send(contact.email, subject, html);
      sent++;
      if (sent % 50 === 0) {
        console.log(`  Sent ${sent}/${total} (via ${provider.name})`);
      }
    } catch (err) {
      errors++;
      console.error(`  FAIL ${contact.email} via ${provider.name}: ${err.message}`);
    }

    // Rate limit between sends
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log(`\nDone. Sent: ${sent} | Errors: ${errors} | Total: ${total}`);

  // Write launch log for observability
  const logEntry = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "live",
    sent,
    errors,
    total,
    providers: providers.map((p) => p.name),
    topClusters: Object.entries(
      contacts.slice(0, total).reduce((acc, c) => {
        const v = c.vertical || "unknown";
        acc[v] = (acc[v] || 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    topSubjects: Object.entries(
      contacts.slice(0, total).reduce((acc, c) => {
        const s = resolveSubject(c.vertical, subjectLines);
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    scoreRange: {
      top: contacts[0]?.total_score || 0,
      bottom: contacts[Math.min(total - 1, contacts.length - 1)]?.total_score || 0,
    },
  };

  const logDir = path.join(path.dirname(require.main?.filename || "."), "output", "logs");
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `send-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
    console.log(`Log saved: ${logFile}`);
  } catch (e) {
    console.warn("Could not write log:", e.message);
  }

  return { sent, errors, total };
}

// ---------------------------------------------------------------------------
// State tracking — avoid re-sending
// ---------------------------------------------------------------------------
function loadSentState(stateFile) {
  if (fs.existsSync(stateFile)) {
    return new Set(JSON.parse(fs.readFileSync(stateFile, "utf-8")));
  }
  return new Set();
}

function saveSentState(stateFile, sentEmails) {
  fs.writeFileSync(stateFile, JSON.stringify([...sentEmails], null, 2));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lists") flags.lists = args[++i];
    else if (args[i] === "--providers") flags.providers = args[++i];
    else if (args[i] === "--config-dir") flags.configDir = args[++i];
    else if (args[i] === "--dry-run") flags.dryRun = true;
    else if (args[i] === "--limit") flags.limit = parseInt(args[++i], 10);
    else if (args[i] === "--delay") flags.delay = parseInt(args[++i], 10);
    else if (args[i] === "--state") flags.state = args[++i];
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Footprint Send Engine — Score-sorted bulk email delivery

Usage:
  node send-engine.js --lists <dir> --providers <config.json> [options]

Options:
  --lists <dir>          Directory containing CSV files (required)
  --providers <path>     Provider configs JSON (default: provider-configs.json)
  --config-dir <dir>     Config directory for subject-lines.json (default: ./config)
  --dry-run              Print what would be sent without sending
  --limit <n>            Max emails to send
  --delay <ms>           Delay between sends in ms (default: 100)
  --state <path>         State file to track sent emails (default: ./send-state.json)
`);
      process.exit(0);
    }
  }

  if (!flags.lists) {
    console.error("--lists required. Run with --help for usage.");
    process.exit(1);
  }

  const listsDir = flags.lists;
  const providerConfig = flags.providers || "provider-configs.json";
  const configDir = flags.configDir || "./config";
  const dryRun = flags.dryRun || false;
  const limit = flags.limit || 0;
  const delayMs = flags.delay ?? 100;
  const stateFile = flags.state || "./send-state.json";

  // 1. Load and sort contacts
  const contacts = loadAndSort(listsDir);

  // 2. Filter out already-sent
  const sentEmails = loadSentState(stateFile);
  const unsent = contacts.filter((c) => !sentEmails.has(c.email));
  console.log(`Already sent: ${sentEmails.size} | Remaining: ${unsent.length}`);

  if (unsent.length === 0) {
    console.log("Nothing to send.");
    return;
  }

  // 3. Load providers (skip in dry run if no config exists)
  let providers;
  if (dryRun && !fs.existsSync(providerConfig)) {
    providers = [{ name: "dry-run", type: "mock", send: async () => {} }];
  } else {
    providers = loadProviders(providerConfig);
  }

  // 4. Load subject lines
  const subjectLines = loadSubjectLines(configDir);
  console.log(`Loaded ${Object.keys(subjectLines).length} subject lines`);

  // 5. Send
  const result = await sendAll(unsent, providers, subjectLines, {
    dryRun,
    limit,
    delayMs,
  });

  // 6. Update state (if not dry run)
  if (!dryRun && result.sent > 0) {
    for (let i = 0; i < result.sent && i < unsent.length; i++) {
      sentEmails.add(unsent[i].email);
    }
    saveSentState(stateFile, sentEmails);
    console.log(`State saved: ${sentEmails.size} total sent`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
