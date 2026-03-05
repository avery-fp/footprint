/**
 * ARO Learning Module — EVOLVE from outcomes
 *
 * Manual event ingestion only. No scraping.
 * User exports analytics → pastes CSV → learning engine processes.
 *
 * Computes lift by layer, category, variant, channel.
 * Deactivates losing variants, boosts winners, adjusts priors.
 */

import { readFileSync } from 'fs'
import type { Lift, EventCSVRow } from './types'
import { getSupabase } from './lib/supabase'

// ─── Ingest events from CSV/JSON ───────────────────────────

export async function ingestEvents(input: string | EventCSVRow[]): Promise<{ ingested: number }> {
  const supabase = getSupabase()

  let rows: EventCSVRow[]
  if (typeof input === 'string') {
    if (input.startsWith('[')) {
      rows = JSON.parse(input)
    } else {
      rows = parseEventCSV(input)
    }
  } else {
    rows = input
  }

  const events = rows.map(row => ({
    channel: row.channel || 'unknown',
    event_type: row.event_type,
    event_value: row.value ? parseFloat(row.value) : null,
    meta: row.meta_json ? JSON.parse(row.meta_json) : {},
    occurred_at: row.occurred_at || new Date().toISOString(),
    // Resolve target_id and message_id from username/serial
    target_id: null as string | null,
    message_id: null as string | null,
  }))

  // Resolve foreign keys
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].username) {
      const { data } = await supabase
        .from('targets')
        .select('id')
        .eq('username', rows[i].username)
        .limit(1)
        .single()
      if (data) events[i].target_id = data.id
    }

    if (rows[i].serial_number) {
      const serial = parseInt(rows[i].serial_number!, 10)
      const { data } = await supabase
        .from('aro_messages')
        .select('id, target_id')
        .eq('serial_number', serial)
        .limit(1)
        .single()
      if (data) {
        events[i].message_id = data.id
        if (!events[i].target_id) events[i].target_id = data.target_id
      }
    }
  }

  // Insert
  const BATCH = 200
  let ingested = 0
  for (let i = 0; i < events.length; i += BATCH) {
    const { error } = await supabase
      .from('aro_events')
      .insert(events.slice(i, i + BATCH))
    if (!error) ingested += Math.min(BATCH, events.length - i)
  }

  console.log(`  [learning] ingested ${ingested} events`)
  return { ingested }
}

// ─── Compute lift ──────────────────────────────────────────

export async function computeLift(): Promise<Lift> {
  const supabase = getSupabase()

  // Get all events with joins
  const { data: events } = await supabase
    .from('aro_events')
    .select('event_type, channel, target_id, message_id')

  const { data: messages } = await supabase
    .from('aro_messages')
    .select('id, variant_id, channel')

  const { data: targets } = await supabase
    .from('targets')
    .select('id, layer, category_id')

  const { data: variants } = await supabase
    .from('message_variants')
    .select('id, name')

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')

  // Build lookup maps
  const msgMap = new Map((messages || []).map(m => [m.id, m]))
  const targetMap = new Map((targets || []).map(t => [t.id, t]))
  const variantMap = new Map((variants || []).map(v => [v.id, v]))
  const catMap = new Map((categories || []).map(c => [c.id, c]))

  // Accumulators
  type Stats = { sent: number; clicks: number; converts: number; rate: number }
  const newStats = (): Stats => ({ sent: 0, clicks: 0, converts: 0, rate: 0 })

  const byLayer: Record<number, Stats> = {}
  const byCategory: Record<string, Stats> = {}
  const byVariant: Record<string, Stats> = {}
  const byChannel: Record<string, Stats> = {}

  for (const e of events || []) {
    const target = e.target_id ? targetMap.get(e.target_id) : null
    const msg = e.message_id ? msgMap.get(e.message_id) : null
    const variant = msg?.variant_id ? variantMap.get(msg.variant_id) : null
    const category = target?.category_id ? catMap.get(target.category_id) : null

    const layer = target?.layer || 0
    const catName = category?.name || 'unknown'
    const varName = variant?.name || 'unknown'
    const channel = e.channel || 'unknown'

    // Init accumulators
    if (!byLayer[layer]) byLayer[layer] = newStats()
    if (!byCategory[catName]) byCategory[catName] = newStats()
    if (!byVariant[varName]) byVariant[varName] = newStats()
    if (!byChannel[channel]) byChannel[channel] = newStats()

    const increment = (s: Stats) => {
      if (e.event_type === 'sent') s.sent++
      if (e.event_type === 'click') s.clicks++
      if (e.event_type === 'convert') s.converts++
    }

    increment(byLayer[layer])
    increment(byCategory[catName])
    increment(byVariant[varName])
    increment(byChannel[channel])
  }

  // Compute rates
  const computeRate = (s: Stats) => {
    s.rate = s.sent > 0 ? s.converts / s.sent : 0
  }

  Object.values(byLayer).forEach(computeRate)
  Object.values(byCategory).forEach(computeRate)
  Object.values(byVariant).forEach(computeRate)
  Object.values(byChannel).forEach(computeRate)

  const lift: Lift = { byLayer, byCategory, byVariant, byChannel }

  console.log('  [learning] lift computed:')
  for (const [layer, stats] of Object.entries(byLayer)) {
    console.log(`    Layer ${layer}: ${stats.sent} sent → ${stats.converts} converts (${(stats.rate * 100).toFixed(1)}%)`)
  }

  return lift
}

// ─── Evolve — adjust the system ────────────────────────────

export async function evolve(): Promise<{ actions: string[] }> {
  const supabase = getSupabase()
  const lift = await computeLift()
  const actions: string[] = []

  // 1. Deactivate losing variants (below median conversion rate)
  const variantRates = Object.entries(lift.byVariant)
    .map(([name, stats]) => ({ name, rate: stats.rate, sent: stats.sent }))
    .filter(v => v.sent >= 5) // minimum sample size

  if (variantRates.length >= 3) {
    const sortedRates = variantRates.map(v => v.rate).sort((a, b) => a - b)
    const median = sortedRates[Math.floor(sortedRates.length / 2)]

    const losers = variantRates.filter(v => v.rate < median * 0.5 && v.sent >= 10)
    for (const loser of losers) {
      await supabase
        .from('message_variants')
        .update({ active: false })
        .eq('name', loser.name)
      actions.push(`deactivated variant '${loser.name}' (rate: ${(loser.rate * 100).toFixed(1)}%)`)
    }
  }

  // 2. Boost winners — duplicate winning variant templates with slight variations
  const winners = variantRates
    .filter(v => v.rate > 0 && v.sent >= 5)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3)

  // (No auto-creation — just log for manual action)
  for (const w of winners) {
    actions.push(`top variant: '${w.name}' (${(w.rate * 100).toFixed(1)}% conversion, ${w.sent} sent)`)
  }

  // 3. Adjust void-layer timing heuristic
  const voidStats = lift.byLayer[6]
  const mainStats = lift.byLayer[5] || lift.byLayer[4]
  if (voidStats && mainStats && mainStats.sent >= 10) {
    if (voidStats.rate > mainStats.rate * 1.2) {
      actions.push('void layer outperforming main — consider reducing void delay')
    } else if (voidStats.rate < mainStats.rate * 0.5) {
      actions.push('void layer underperforming — consider increasing void delay')
    }
  }

  // 4. Save learning snapshot
  const snapshot = {
    timestamp: new Date().toISOString(),
    lift,
    actions,
    variant_count: variantRates.length,
    total_events: Object.values(lift.byChannel).reduce((sum, s) => sum + s.sent + s.clicks + s.converts, 0),
  }

  await supabase
    .from('learning_snapshots')
    .insert({ snapshot_json: snapshot })

  console.log(`  [learning] evolve complete — ${actions.length} actions:`)
  for (const a of actions) console.log(`    → ${a}`)

  return { actions }
}

// ─── Load events from file ─────────────────────────────────

export async function ingestEventsFromFile(filePath: string): Promise<{ ingested: number }> {
  const content = readFileSync(filePath, 'utf-8')
  return ingestEvents(content)
}

// ─── CSV parser ────────────────────────────────────────────

function parseEventCSV(content: string): EventCSVRow[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const rows: EventCSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] || '' })
    rows.push(row as unknown as EventCSVRow)
  }

  return rows
}
