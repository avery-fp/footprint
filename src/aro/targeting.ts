/**
 * ARO Targeting Module — WHO to reach
 *
 * 6-layer model:
 *   Layer 1: Aesthetic matches (high visual alignment)
 *   Layer 2: Top 1000 mega accounts (aspirational)
 *   Layer 3: Top 3 per category (niche authority)
 *   Layer 4: Based accounts (culture aligned)
 *   Layer 5: Link-in-bio users (high intent)
 *   Layer 6: Void layer (delayed reach, 30% holdback)
 *
 * No scraping. Targets come from user-provided CSV/JSON or manual entry.
 */

import { readFileSync } from 'fs'
import type { Target, TargetCSVRow } from './types'
import { getSupabase } from './lib/supabase'

// ─── Ingest targets from CSV/JSON ──────────────────────────

export async function ingestTargets(input: {
  source: 'csv' | 'json' | 'manual'
  payload: string | TargetCSVRow[]
}): Promise<{ ingested: number; errors: string[] }> {
  const supabase = getSupabase()
  let rows: TargetCSVRow[]

  if (input.source === 'csv' && typeof input.payload === 'string') {
    rows = parseCSV(input.payload)
  } else if (input.source === 'json' && typeof input.payload === 'string') {
    rows = JSON.parse(input.payload)
  } else if (input.source === 'manual' && Array.isArray(input.payload)) {
    rows = input.payload
  } else {
    return { ingested: 0, errors: ['Invalid input format'] }
  }

  const errors: string[] = []
  let ingested = 0

  // Ensure categories exist
  const categoryNames = Array.from(new Set(rows.map(r => r.category).filter(Boolean)))
  for (const name of categoryNames) {
    await supabase
      .from('categories')
      .upsert({ name }, { onConflict: 'name' })
  }

  // Fetch category map
  const { data: cats } = await supabase.from('categories').select('id, name')
  const catMap = new Map((cats || []).map(c => [c.name, c.id]))

  // Batch insert targets
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(row => ({
      platform: row.platform || 'unknown',
      username: row.username,
      display_name: row.display_name || null,
      url: row.url || null,
      category_id: catMap.get(row.category) || null,
      follower_count: row.followers ? parseInt(row.followers, 10) : null,
      link_in_bio: row.link_in_bio === 'true' || row.link_in_bio === '1',
      layer: row.layer ? parseInt(row.layer, 10) : 5,
      signals: row.signals_json ? JSON.parse(row.signals_json) : {},
      status: 'new',
    }))

    const { error } = await supabase
      .from('targets')
      .upsert(batch, { onConflict: 'platform,username' })

    if (error) {
      errors.push(`Batch ${i}: ${error.message}`)
    } else {
      ingested += batch.length
    }
  }

  console.log(`  [targeting] ingested ${ingested} targets (${errors.length} errors)`)
  return { ingested, errors }
}

// ─── Score targets ─────────────────────────────────────────

export async function scoreTargets(): Promise<{ scored: number }> {
  const supabase = getSupabase()

  const { data: targets, error } = await supabase
    .from('targets')
    .select('id, follower_count, link_in_bio, signals, layer, category_id')

  if (error || !targets) {
    console.log(`  [targeting] score error: ${error?.message}`)
    return { scored: 0 }
  }

  // Load historical conversion rates per category
  const { data: events } = await supabase
    .from('aro_events')
    .select('target_id, event_type')
    .in('event_type', ['click', 'convert'])

  const conversionsByTarget = new Map<string, { clicks: number; converts: number }>()
  for (const e of events || []) {
    if (!e.target_id) continue
    const rec = conversionsByTarget.get(e.target_id) || { clicks: 0, converts: 0 }
    if (e.event_type === 'click') rec.clicks++
    if (e.event_type === 'convert') rec.converts++
    conversionsByTarget.set(e.target_id, rec)
  }

  // Score each target
  const updates: { id: string; influence_score: number; conversion_probability: number }[] = []

  for (const t of targets) {
    // Influence: log-scaled followers + layer bonus + link_in_bio bonus
    const followerScore = t.follower_count
      ? Math.min(1.0, Math.log10(Math.max(t.follower_count, 1)) / 7) // log10(10M) = 7
      : 0

    const layerBonus = [0, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05][t.layer] || 0
    const libBonus = t.link_in_bio ? 0.15 : 0

    const influence_score = Math.min(1.0,
      followerScore * 0.4 + layerBonus + libBonus
      + (t.signals?.engagement_rate ? Number(t.signals.engagement_rate) * 0.2 : 0)
    )

    // Conversion probability: prior from events + category base rate
    const hist = conversionsByTarget.get(t.id)
    let conversion_probability = 0.02 // base 2%

    if (hist && hist.clicks > 0) {
      conversion_probability = hist.converts / hist.clicks
    } else {
      // Layer-based priors
      const layerPriors = [0, 0.08, 0.05, 0.06, 0.04, 0.10, 0.02]
      conversion_probability = layerPriors[t.layer] || 0.02
    }

    // Link-in-bio users convert higher (they already understand the concept)
    if (t.link_in_bio) {
      conversion_probability = Math.min(1.0, conversion_probability * 1.5)
    }

    updates.push({
      id: t.id,
      influence_score: Math.round(influence_score * 10000) / 10000,
      conversion_probability: Math.round(conversion_probability * 10000) / 10000,
    })
  }

  // Batch update
  const BATCH = 200
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    for (const u of batch) {
      await supabase
        .from('targets')
        .update({ influence_score: u.influence_score, conversion_probability: u.conversion_probability })
        .eq('id', u.id)
    }
  }

  console.log(`  [targeting] scored ${updates.length} targets`)
  return { scored: updates.length }
}

// ─── Apply void layer ──────────────────────────────────────

export async function applyVoidLayer(): Promise<{ voided: number }> {
  const supabase = getSupabase()

  // Get all non-voided targets grouped by category
  const { data: targets } = await supabase
    .from('targets')
    .select('id, category_id')
    .eq('void_flag', false)
    .order('conversion_probability', { ascending: true })

  if (!targets || targets.length === 0) return { voided: 0 }

  // Group by category
  const byCat = new Map<string, string[]>()
  for (const t of targets) {
    const key = t.category_id || 'uncategorized'
    const arr = byCat.get(key) || []
    arr.push(t.id)
    byCat.set(key, arr)
  }

  // Void bottom 30% of each category
  const toVoid: string[] = []
  for (const [, ids] of Array.from(byCat)) {
    const count = Math.ceil(ids.length * 0.3)
    toVoid.push(...ids.slice(0, count))
  }

  if (toVoid.length > 0) {
    const BATCH = 200
    for (let i = 0; i < toVoid.length; i += BATCH) {
      await supabase
        .from('targets')
        .update({ void_flag: true, layer: 6 })
        .in('id', toVoid.slice(i, i + BATCH))
    }
  }

  console.log(`  [targeting] voided ${toVoid.length} targets (30% holdback → layer 6)`)
  return { voided: toVoid.length }
}

// ─── Build ranked target list ──────────────────────────────

export async function buildRankedTargets(): Promise<{ targets: Target[]; byLayer: Record<number, number> }> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('targets')
    .select('*')
    .order('layer', { ascending: true })
    .order('conversion_probability', { ascending: false })

  if (error || !data) {
    console.log(`  [targeting] rank error: ${error?.message}`)
    return { targets: [], byLayer: {} }
  }

  const byLayer: Record<number, number> = {}
  for (const t of data) {
    byLayer[t.layer] = (byLayer[t.layer] || 0) + 1
  }

  console.log(`  [targeting] ranked ${data.length} targets:`)
  for (const [layer, count] of Object.entries(byLayer)) {
    console.log(`    Layer ${layer}: ${count}`)
  }

  return { targets: data as Target[], byLayer }
}

// ─── CSV parser ────────────────────────────────────────────

function parseCSV(content: string): TargetCSVRow[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const rows: TargetCSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] || '' })
    rows.push(row as unknown as TargetCSVRow)
  }

  return rows
}

// ─── Load from file ────────────────────────────────────────

export async function ingestFromFile(filePath: string): Promise<{ ingested: number; errors: string[] }> {
  const content = readFileSync(filePath, 'utf-8')
  const isJSON = filePath.endsWith('.json')
  return ingestTargets({
    source: isJSON ? 'json' : 'csv',
    payload: content,
  })
}
