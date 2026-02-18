/**
 * ARO Orchestrator — ONE COMMAND to run the brain
 *
 * `npm run aro` executes:
 *   1. Seed variants + serials (idempotent)
 *   2. Ingest targets from ./input/targets.csv (if exists)
 *   3. Score all targets
 *   4. Apply void layer (30% holdback)
 *   5. Build 72h distribution plan
 *   6. Generate messages per plan
 *   7. Export outputs to ./output/
 *   8. (Optional) Ingest events + evolve
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { ingestFromFile, scoreTargets, applyVoidLayer, buildRankedTargets } from './targeting'
import { seedMessageVariants, generateMessages } from './messages'
import { buildPlan } from './distribution'
import { ingestEventsFromFile, evolve, computeLift } from './learning'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function runARO(opts: { dryRun?: boolean } = {}): Promise<void> {
  const startTime = Date.now()
  const dryRun = opts.dryRun || false

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   ARO INTELLIGENCE LAYER                 ║')
  console.log('║   footprint.site distribution brain       ║')
  console.log(`║   mode: ${dryRun ? 'DRY RUN' : 'LIVE'}                             ║`)
  console.log('╚══════════════════════════════════════════╝\n')

  const inputDir = join(process.cwd(), 'input')
  const outputDir = join(process.cwd(), 'output')
  mkdirSync(outputDir, { recursive: true })
  mkdirSync(join(outputDir, 'snapshots'), { recursive: true })

  // ─── Step 1: Seed variants + verify serials ──────────────
  console.log('─── STEP 1: Seed ───')
  await seedMessageVariants()

  // ─── Step 2: Ingest targets ──────────────────────────────
  console.log('\n─── STEP 2: Ingest targets ───')
  const targetsFile = join(inputDir, 'targets.csv')
  if (existsSync(targetsFile)) {
    const result = await ingestFromFile(targetsFile)
    console.log(`  → ${result.ingested} targets ingested`)
    if (result.errors.length > 0) {
      console.log(`  → ${result.errors.length} errors`)
    }
  } else {
    console.log(`  → No ${targetsFile} found — skipping ingestion`)
    console.log('  → Add targets via CSV or POST /api/aro/ingest/targets')
  }

  // ─── Step 3: Score targets ───────────────────────────────
  console.log('\n─── STEP 3: Score targets ───')
  const scoreResult = await scoreTargets()
  console.log(`  → ${scoreResult.scored} targets scored`)

  // ─── Step 4: Apply void layer ────────────────────────────
  console.log('\n─── STEP 4: Void layer ───')
  const voidResult = await applyVoidLayer()
  console.log(`  → ${voidResult.voided} targets assigned to void layer`)

  // ─── Step 5: Build distribution plan ─────────────────────
  console.log('\n─── STEP 5: Distribution plan ───')
  const channels = ['email', 'sdr', 'creators']
  const { planId, plan } = await buildPlan({
    startAt: new Date(),
    durationHours: 72,
    channels,
  })

  // ─── Step 6: Generate messages ───────────────────────────
  console.log('\n─── STEP 6: Generate messages ───')
  let totalGenerated = 0
  for (const channel of channels) {
    const result = await generateMessages({ channel, perTargetVariants: 1 })
    totalGenerated += result.generated
  }
  console.log(`  → ${totalGenerated} total messages generated`)

  // ─── Step 7: Export outputs ──────────────────────────────
  console.log('\n─── STEP 7: Export ───')

  const supabase = getSupabase()

  // Export ranked targets
  const { targets: rankedTargets, byLayer } = await buildRankedTargets()
  writeFileSync(
    join(outputDir, 'ranked_targets.json'),
    JSON.stringify({ total: rankedTargets.length, byLayer, targets: rankedTargets }, null, 2)
  )
  console.log(`  → ranked_targets.json (${rankedTargets.length} targets)`)

  // Export messages as CSV
  const { data: allMessages } = await supabase
    .from('aro_messages')
    .select('*, targets(username, platform)')
    .order('scheduled_at', { ascending: true })

  if (allMessages && allMessages.length > 0) {
    const csvLines = ['target_username,platform,serial_number,body,channel,scheduled_at']
    for (const m of allMessages) {
      const target = m.targets as unknown as { username: string; platform: string } | null
      csvLines.push([
        target?.username || '',
        target?.platform || '',
        m.serial_number,
        `"${m.body.replace(/"/g, '""')}"`,
        m.channel,
        m.scheduled_at || '',
      ].join(','))
    }
    writeFileSync(join(outputDir, 'messages.csv'), csvLines.join('\n'))
    console.log(`  → messages.csv (${allMessages.length} messages)`)
  }

  // Export distribution plan
  if (plan) {
    writeFileSync(
      join(outputDir, 'distribution_plan.json'),
      JSON.stringify(plan, null, 2)
    )
    console.log(`  → distribution_plan.json`)
  }

  // ─── Step 8: Events + Learning (optional) ────────────────
  const eventsFile = join(inputDir, 'events.csv')
  if (existsSync(eventsFile)) {
    console.log('\n─── STEP 8: Learn ───')
    const eventResult = await ingestEventsFromFile(eventsFile)
    console.log(`  → ${eventResult.ingested} events ingested`)

    const { actions } = await evolve()
    console.log(`  → ${actions.length} evolution actions`)

    // Export snapshot
    const lift = await computeLift()
    const snapshotFile = join(outputDir, 'snapshots', `snapshot_${new Date().toISOString().slice(0, 10)}.json`)
    writeFileSync(snapshotFile, JSON.stringify(lift, null, 2))
    console.log(`  → ${snapshotFile}`)
  } else {
    console.log('\n─── STEP 8: Learn (skipped — no events.csv) ───')
  }

  // ─── Done ────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n╔══════════════════════════════════════════╗')
  console.log(`║   ARO complete in ${elapsed}s`)
  console.log(`║   Targets:  ${rankedTargets.length}`)
  console.log(`║   Messages: ${totalGenerated}`)
  console.log(`║   Waves:    ${plan.waves.length}`)
  console.log(`║   Output:   ./output/`)
  console.log('╚══════════════════════════════════════════╝\n')
}
