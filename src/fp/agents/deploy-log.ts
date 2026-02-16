/**
 * DEPLOY LOG — tracks every deployment action.
 *
 * Logs to:
 *   1. Local JSON files: deploy-log/{date}.json (always works)
 *   2. Supabase table: aro_deploy_log (if SUPABASE keys available)
 *
 * Every comment posted, every failure, every rate limit — all logged.
 * This feeds into Darwin later for optimization.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Types ──────────────────────────────────────────────

export type DeployStatus = 'posted' | 'failed' | 'rate_limited' | 'queued' | 'dry_run'

export interface DeployLogEntry {
  id: string
  timestamp: string
  platform: string
  target_url: string
  comment_text: string
  room_url: string
  status: DeployStatus
  error?: string
  engagement?: { upvotes?: number; likes?: number; replies?: number }
}

// ─── ID generation ──────────────────────────────────────

function generateId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `dl_${timestamp}_${random}`
}

// ─── Local file logging ─────────────────────────────────

const LOG_DIR = resolve(process.cwd(), 'deploy-log')

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return resolve(LOG_DIR, `${date}.json`)
}

function readLogFile(path: string): DeployLogEntry[] {
  if (!existsSync(path)) return []
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

function writeLogFile(path: string, entries: DeployLogEntry[]): void {
  writeFileSync(path, JSON.stringify(entries, null, 2), 'utf-8')
}

// ─── Supabase logging (optional) ────────────────────────

async function logToSupabase(entry: DeployLogEntry): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) return

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/aro_deploy_log`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: entry.id,
        timestamp: entry.timestamp,
        platform: entry.platform,
        target_url: entry.target_url,
        comment_text: entry.comment_text,
        room_url: entry.room_url,
        status: entry.status,
        error: entry.error || null,
        engagement: entry.engagement || null,
      }),
    })

    if (!response.ok) {
      // Supabase logging is best-effort, don't fail the pipeline
      console.error(`  [deploy-log] Supabase insert failed: ${response.status}`)
    }
  } catch {
    // Silently ignore Supabase errors — local log is the source of truth
  }
}

// ─── Public API ─────────────────────────────────────────

export async function log(entry: Omit<DeployLogEntry, 'id' | 'timestamp'>): Promise<DeployLogEntry> {
  const fullEntry: DeployLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    ...entry,
  }

  // Always log locally
  ensureLogDir()
  const logFile = getLogFile()
  const existing = readLogFile(logFile)
  existing.push(fullEntry)
  writeLogFile(logFile, existing)

  // Best-effort Supabase insert
  await logToSupabase(fullEntry)

  return fullEntry
}

export function getTodaysLog(): DeployLogEntry[] {
  ensureLogDir()
  return readLogFile(getLogFile())
}

export function getStats(): { total: number; posted: number; failed: number; by_platform: Record<string, number> } {
  const entries = getTodaysLog()
  const stats = {
    total: entries.length,
    posted: entries.filter(e => e.status === 'posted').length,
    failed: entries.filter(e => e.status === 'failed').length,
    by_platform: {} as Record<string, number>,
  }

  for (const entry of entries) {
    stats.by_platform[entry.platform] = (stats.by_platform[entry.platform] || 0) + 1
  }

  return stats
}
