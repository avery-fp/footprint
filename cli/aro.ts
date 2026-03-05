#!/usr/bin/env tsx
/**
 * ARO CLI — one-command distribution brain
 *
 * Usage:
 *   npx tsx cli/aro.ts run            Run full ARO pipeline
 *   npx tsx cli/aro.ts run --dry      Dry run (no writes)
 *   npx tsx cli/aro.ts ingest-targets input/targets.csv
 *   npx tsx cli/aro.ts ingest-events  input/events.csv
 *   npx tsx cli/aro.ts export         Export current state to ./output/
 */

import { runARO } from '../src/aro/orchestrator'
import { ingestFromFile } from '../src/aro/targeting'
import { ingestEventsFromFile, computeLift } from '../src/aro/learning'
import { buildRankedTargets } from '../src/aro/targeting'
import { getSupabase } from '../src/aro/lib/supabase'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const args = process.argv.slice(2)
const command = args[0]

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    console.error('See .env.example')
    process.exit(1)
  }

  switch (command) {
    case 'run': {
      const dryRun = args.includes('--dry')
      await runARO({ dryRun })
      break
    }

    case 'ingest-targets': {
      const file = args[1]
      if (!file) {
        console.error('Usage: aro ingest-targets <file.csv>')
        process.exit(1)
      }
      const result = await ingestFromFile(file)
      console.log(`Done: ${result.ingested} targets ingested, ${result.errors.length} errors`)
      break
    }

    case 'ingest-events': {
      const file = args[1]
      if (!file) {
        console.error('Usage: aro ingest-events <file.csv>')
        process.exit(1)
      }
      const result = await ingestEventsFromFile(file)
      console.log(`Done: ${result.ingested} events ingested`)
      break
    }

    case 'export': {
      const outputDir = join(process.cwd(), 'output')
      mkdirSync(outputDir, { recursive: true })

      const supabase = getSupabase()

      // Ranked targets
      const { targets, byLayer } = await buildRankedTargets()
      writeFileSync(
        join(outputDir, 'ranked_targets.json'),
        JSON.stringify({ total: targets.length, byLayer, targets }, null, 2)
      )

      // Messages
      const { data: messages } = await supabase
        .from('aro_messages')
        .select('*')
        .order('scheduled_at', { ascending: true })

      if (messages) {
        const lines = ['target_id,serial_number,body,channel,scheduled_at']
        for (const m of messages) {
          lines.push(`${m.target_id},${m.serial_number},"${m.body.replace(/"/g, '""')}",${m.channel},${m.scheduled_at || ''}`)
        }
        writeFileSync(join(outputDir, 'messages.csv'), lines.join('\n'))
      }

      // Lift
      const lift = await computeLift()
      writeFileSync(join(outputDir, 'lift.json'), JSON.stringify(lift, null, 2))

      // Latest plan
      const { data: plan } = await supabase
        .from('distribution_plans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (plan) {
        writeFileSync(
          join(outputDir, 'distribution_plan.json'),
          JSON.stringify(plan.plan_json, null, 2)
        )
      }

      console.log(`Exported to ./output/`)
      break
    }

    default:
      console.log(`
ARO Intelligence Layer — CLI

Commands:
  run [--dry]              Run full ARO pipeline
  ingest-targets <file>    Import targets from CSV/JSON
  ingest-events <file>     Import outcome events from CSV/JSON
  export                   Export current state to ./output/

Examples:
  npx tsx cli/aro.ts run
  npx tsx cli/aro.ts ingest-targets input/targets.csv
  npx tsx cli/aro.ts ingest-events input/events.csv
  npx tsx cli/aro.ts export
      `)
  }
}

main().catch(err => {
  console.error('ARO error:', err.message)
  process.exit(1)
})
