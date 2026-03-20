#!/usr/bin/env node
/**
 * send-engine.js — SES bulk email sender
 *
 * Reads CSV batches + HTML template, sends via AWS SES.
 * Supports multiple SES configs for parallel sending across accounts.
 * Round-robins respecting rate limits, dedupes against sent-log.csv,
 * stoppable/resumable, retry logic.
 *
 * Usage:
 *   node scripts/send-engine.js --template templates/outreach.html --lists lists/music.csv,lists/design.csv
 *   node scripts/send-engine.js --template templates/outreach.html --lists-dir lists/
 *   node scripts/send-engine.js --resume   # resume from sent-log.csv
 *   node scripts/send-engine.js --dry-run --template templates/outreach.html --lists lists/music.csv
 *
 * Required files:
 *   ses-configs.json — array of SES account configs
 *   templates/<name>.html — email template with {{first_name}}, {{vertical}}, etc.
 *
 * ses-configs.json format:
 * [
 *   {
 *     "name": "account-1",
 *     "region": "us-east-1",
 *     "accessKeyId": "AKIA...",
 *     "secretAccessKey": "...",
 *     "fromEmail": "hello@yourdomain.com",
 *     "fromName": "Footprint",
 *     "ratePerSecond": 10
 *   }
 * ]
 */

const fs = require('fs')
const path = require('path')

// Lazy-load SES SDK — not needed for --dry-run
let SESClient, SendEmailCommand
function requireSES() {
  if (!SESClient) {
    const ses = require('@aws-sdk/client-ses')
    SESClient = ses.SESClient
    SendEmailCommand = ses.SendEmailCommand
  }
}

// ═══════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════

const SENT_LOG = path.resolve(process.cwd(), 'sent-log.csv')
const SES_CONFIGS_PATH = path.resolve(process.cwd(), 'ses-configs.json')
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000

// Subject line variants per vertical
const SUBJECT_VARIANTS = {
  music:         ['your sound deserves a home', 'one link for everything you make'],
  design:        ['your portfolio, elevated', 'designers are switching to this'],
  photography:   ['your photos deserve better than linktree', 'a home for your lens'],
  film:          ['your reel, one link', 'filmmakers are building here'],
  fitness:       ['your fitness brand, one link', 'coaches are switching'],
  gaming:        ['level up your online presence', 'gamers are building here'],
  fashion:       ['your style, one link', 'fashion creators love this'],
  art:           ['your art deserves a home online', 'artists are switching'],
  tech:          ['ship your personal page in 2 min', 'devs are building here'],
  sports:        ['your career, one link', 'athletes are switching'],
  food:          ['your recipes deserve a home', 'chefs are building here'],
  travel:        ['your adventures, one link', 'travelers love this'],
  education:     ['your courses, one link', 'educators are switching'],
  'real-estate': ['your listings, one link', 'agents are switching'],
  crypto:        ['your web3 presence, one link', 'crypto builders love this'],
  comedy:        ['your bits deserve a home', 'comedians are building here'],
  writing:       ['your words, one link', 'writers are switching'],
  dance:         ['your movement, one link', 'dancers are building here'],
  beauty:        ['your beauty brand, one link', 'beauty creators love this'],
  architecture:  ['your portfolio, one link', 'architects are switching'],
  _default:      ['your work deserves a home', 'one link for everything you do'],
}

// ═══════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function csvParseLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

function loadCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').trim()
  const lines = content.split('\n')
  if (lines.length < 2) return []

  const headers = csvParseLine(lines[0]).map(h => h.trim().toLowerCase())
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const vals = csvParseLine(lines[i])
    const row = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (vals[j] || '').trim()
    }
    if (row.email) rows.push(row)
  }

  return rows
}

function loadSentLog() {
  const sent = new Set()
  if (!fs.existsSync(SENT_LOG)) return sent

  const content = fs.readFileSync(SENT_LOG, 'utf-8').trim()
  for (const line of content.split('\n').slice(1)) { // skip header
    const email = line.split(',')[0]?.trim().toLowerCase()
    if (email) sent.add(email)
  }
  return sent
}

function appendSentLog(email, vertical, account, messageId) {
  const exists = fs.existsSync(SENT_LOG)
  if (!exists) {
    fs.writeFileSync(SENT_LOG, 'email,vertical,account,message_id,sent_at\n', 'utf-8')
  }
  const line = `${email},${vertical},${account},${messageId},${new Date().toISOString()}\n`
  fs.appendFileSync(SENT_LOG, line, 'utf-8')
}

function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

function pickSubject(vertical) {
  const variants = SUBJECT_VARIANTS[vertical] || SUBJECT_VARIANTS._default
  return variants[Math.floor(Math.random() * variants.length)]
}

// ═══════════════════════════════════════════
// SES Account Pool (round-robin with rate limiting)
// ═══════════════════════════════════════════

class SESPool {
  constructor(configs, dryRun = false) {
    if (!dryRun) requireSES()
    this.accounts = configs.map(cfg => ({
      name: cfg.name || cfg.fromEmail,
      client: dryRun ? null : new SESClient({
        region: cfg.region || 'us-east-1',
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
      }),
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName || 'Footprint',
      ratePerSecond: cfg.ratePerSecond || 10,
      lastSendTime: 0,
      sentCount: 0,
    }))
    this.index = 0
  }

  async getNext() {
    const account = this.accounts[this.index % this.accounts.length]
    this.index++

    // Rate limit: ensure minimum interval between sends per account
    const minInterval = 1000 / account.ratePerSecond
    const elapsed = Date.now() - account.lastSendTime
    if (elapsed < minInterval) {
      await sleep(minInterval - elapsed)
    }

    return account
  }

  stats() {
    return this.accounts.map(a => `${a.name}: ${a.sentCount} sent`)
  }
}

// ═══════════════════════════════════════════
// Send email
// ═══════════════════════════════════════════

async function sendEmail(account, to, subject, htmlBody, dryRun = false) {
  if (dryRun) {
    console.log(`  [DRY] → ${to} via ${account.name} | "${subject}"`)
    return { MessageId: 'dry-run-' + Date.now() }
  }

  const from = account.fromName
    ? `${account.fromName} <${account.fromEmail}>`
    : account.fromEmail

  const command = new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } },
    },
  })

  const result = await account.client.send(command)
  account.lastSendTime = Date.now()
  account.sentCount++
  return result
}

async function sendWithRetry(account, to, subject, htmlBody, dryRun, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await sendEmail(account, to, subject, htmlBody, dryRun)
    } catch (err) {
      const isThrottled = err.name === 'Throttling' || err.$metadata?.httpStatusCode === 429
      const isTransient = err.$metadata?.httpStatusCode >= 500

      if ((isThrottled || isTransient) && attempt < retries) {
        const delay = RETRY_DELAY_MS * attempt
        console.log(`    retry ${attempt}/${retries} for ${to} in ${delay}ms — ${err.message}`)
        await sleep(delay)
        continue
      }
      throw err
    }
  }
}

// ═══════════════════════════════════════════
// Graceful shutdown
// ═══════════════════════════════════════════

let stopping = false

function setupShutdown() {
  const handler = () => {
    if (stopping) {
      console.log('\nForce quit.')
      process.exit(1)
    }
    stopping = true
    console.log('\n⏸  Stopping after current email... (Ctrl+C again to force)')
  }
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
}

// ═══════════════════════════════════════════
// Main
// ═══════════════════════════════════════════

async function main() {
  setupShutdown()

  const args = process.argv.slice(2)
  let templatePath = null
  let listFiles = []
  let listsDir = null
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--template': templatePath = args[++i]; break
      case '--lists': listFiles = args[++i].split(','); break
      case '--lists-dir': listsDir = args[++i]; break
      case '--dry-run': dryRun = true; break
      case '--resume': break // resume is default behavior via sent-log
    }
  }

  // Load SES configs
  if (!fs.existsSync(SES_CONFIGS_PATH)) {
    console.error(`FATAL: ${SES_CONFIGS_PATH} not found. See script header for format.`)
    process.exit(1)
  }
  const sesConfigs = JSON.parse(fs.readFileSync(SES_CONFIGS_PATH, 'utf-8'))
  if (!Array.isArray(sesConfigs) || sesConfigs.length === 0) {
    console.error('FATAL: ses-configs.json must be a non-empty array')
    process.exit(1)
  }
  const pool = new SESPool(sesConfigs, dryRun)
  console.log(`SES pool: ${sesConfigs.length} account(s)`)

  // Load template
  if (!templatePath) {
    console.error('FATAL: --template required')
    process.exit(1)
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`FATAL: template not found: ${templatePath}`)
    process.exit(1)
  }
  const template = fs.readFileSync(templatePath, 'utf-8')

  // Gather list files
  if (listsDir) {
    const dir = path.resolve(listsDir)
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'))
    listFiles = files.map(f => path.join(dir, f))
  } else {
    listFiles = listFiles.map(f => path.resolve(f))
  }

  if (listFiles.length === 0) {
    console.error('FATAL: no CSV files. Use --lists or --lists-dir')
    process.exit(1)
  }

  // Load all contacts
  let allContacts = []
  for (const file of listFiles) {
    const vertical = path.basename(file, '.csv')
    const rows = loadCSV(file)
    for (const row of rows) {
      row.vertical = row.vertical || vertical
    }
    allContacts.push(...rows)
    console.log(`  ${vertical}: ${rows.length} contacts`)
  }

  // Dedupe: in-memory (across CSVs) + against sent log
  const sentEmails = loadSentLog()
  const seenEmails = new Set()
  const queue = allContacts.filter(c => {
    const email = c.email.toLowerCase()
    if (sentEmails.has(email) || seenEmails.has(email)) return false
    seenEmails.add(email)
    return true
  })

  console.log(`\n${allContacts.length} total → ${sentEmails.size} already sent → ${queue.length} to send`)
  if (dryRun) console.log('--- DRY RUN MODE ---')

  // Send loop
  let sent = 0
  let failed = 0

  for (const contact of queue) {
    if (stopping) break

    const account = await pool.getNext()
    const subject = pickSubject(contact.vertical)
    const html = renderTemplate(template, {
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email,
      title: contact.title || '',
      company: contact.company || '',
      vertical: contact.vertical || '',
    })

    try {
      const result = await sendWithRetry(account, contact.email, subject, html, dryRun)
      const messageId = result?.MessageId || 'unknown'

      if (!dryRun) {
        appendSentLog(contact.email, contact.vertical, account.name, messageId)
      }

      sent++
      if (sent % 50 === 0) {
        console.log(`  ✓ ${sent}/${queue.length} sent | ${failed} failed`)
      }
    } catch (err) {
      failed++
      console.error(`  ✗ ${contact.email}: ${err.message}`)
    }
  }

  // Summary
  console.log(`\n═══ Done ═══`)
  console.log(`  Sent: ${sent}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Stopped: ${stopping ? 'yes (resumable)' : 'no'}`)
  console.log(`  Per account:`)
  for (const stat of pool.stats()) {
    console.log(`    ${stat}`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
