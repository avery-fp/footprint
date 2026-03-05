/**
 * ARO Distribution Module — WHEN/WHERE to reach
 *
 * Creates channel-agnostic distribution plans.
 * Channels are labels only: 'email', 'x_api', 'ig_api', 'sdr', 'creators', 'referral'
 * No platform automation implemented — just planning.
 *
 * Waves:
 *   wave0 — high influence targets (layer 1-2), immediate
 *   wave1 — network targets (layer 3-5), staggered
 *   wave2 — void fill (layer 6), delayed +48h
 */

import type { PlanJSON, Wave } from './types'
import { getSupabase } from './lib/supabase'

// ─── Time window definitions ───────────────────────────────

const TIME_WINDOWS = {
  // US East + West + EU overlap windows (all in UTC offsets from start)
  morning_us:   { offset: 0, label: '7-9 AM EST / 1-3 PM CET' },
  midday_us:    { offset: 5, label: '12-1 PM EST / 6-7 PM CET' },
  afternoon_us: { offset: 8, label: '3-5 PM EST / 9-11 PM CET' },
  evening_us:   { offset: 12, label: '7-9 PM EST / 4-6 PM PST' },
  late_us:      { offset: 15, label: '10-11 PM EST / 7-8 PM PST' },
}

// ─── Build distribution plan ───────────────────────────────

export async function buildPlan(opts: {
  startAt?: Date
  durationHours?: number
  channels?: string[]
}): Promise<{ planId: string; plan: PlanJSON }> {
  const supabase = getSupabase()
  const startAt = opts.startAt || new Date()
  const durationHours = opts.durationHours || 72
  const channels = opts.channels || ['email', 'sdr', 'creators']

  const endAt = new Date(startAt.getTime() + durationHours * 60 * 60 * 1000)

  // Get targets by layer
  const { data: targets } = await supabase
    .from('targets')
    .select('id, layer, conversion_probability')
    .order('conversion_probability', { ascending: false })

  if (!targets || targets.length === 0) {
    console.log('  [distribution] no targets to plan for')
    return { planId: '', plan: { waves: [], channels, total_messages: 0, duration_hours: durationHours } }
  }

  // Split into waves
  const wave0Targets = targets.filter(t => t.layer <= 2).map(t => t.id)
  const wave1Targets = targets.filter(t => t.layer >= 3 && t.layer <= 5).map(t => t.id)
  const wave2Targets = targets.filter(t => t.layer === 6).map(t => t.id)

  const waves: Wave[] = []
  const primaryChannel = channels[0] || 'email'

  // Wave 0: High influence — immediate, spread across first day
  if (wave0Targets.length > 0) {
    waves.push({
      name: 'wave0_influence',
      start_offset_hours: 0,
      targets: wave0Targets,
      channel: primaryChannel,
      priority: 1,
    })
  }

  // Wave 1: Network — staggered across days 1-2
  if (wave1Targets.length > 0) {
    // Split wave1 across multiple windows
    const chunkSize = Math.ceil(wave1Targets.length / 4)
    const windows = Object.values(TIME_WINDOWS)

    for (let i = 0; i < Math.min(4, Math.ceil(wave1Targets.length / chunkSize)); i++) {
      const chunk = wave1Targets.slice(i * chunkSize, (i + 1) * chunkSize)
      const window = windows[i % windows.length]
      const dayOffset = i >= 2 ? 24 : 0 // days 1-2

      waves.push({
        name: `wave1_network_${i}`,
        start_offset_hours: window.offset + dayOffset,
        targets: chunk,
        channel: channels[i % channels.length] || primaryChannel,
        priority: 2,
      })
    }
  }

  // Wave 2: Void — delayed +48h
  if (wave2Targets.length > 0) {
    waves.push({
      name: 'wave2_void',
      start_offset_hours: 48,
      targets: wave2Targets,
      channel: primaryChannel,
      priority: 3,
    })
  }

  // Schedule messages based on plan
  for (const wave of waves) {
    const waveStart = new Date(startAt.getTime() + wave.start_offset_hours * 60 * 60 * 1000)

    // Spread targets within wave window (1 per minute max)
    for (let i = 0; i < wave.targets.length; i++) {
      const scheduledAt = new Date(waveStart.getTime() + i * 60 * 1000) // 1 min apart

      await supabase
        .from('aro_messages')
        .update({ scheduled_at: scheduledAt.toISOString() })
        .eq('target_id', wave.targets[i])
        .eq('channel', wave.channel)
        .is('scheduled_at', null)
    }
  }

  const plan: PlanJSON = {
    waves,
    channels,
    total_messages: targets.length,
    duration_hours: durationHours,
  }

  // Save plan
  const { data: inserted, error } = await supabase
    .from('distribution_plans')
    .insert({
      name: `aro_plan_${startAt.toISOString().slice(0, 10)}`,
      plan_json: plan,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.log(`  [distribution] save error: ${error.message}`)
    return { planId: '', plan }
  }

  console.log(`  [distribution] plan created:`)
  console.log(`    waves: ${waves.length}`)
  console.log(`    wave0 (influence): ${wave0Targets.length} targets`)
  console.log(`    wave1 (network):   ${wave1Targets.length} targets`)
  console.log(`    wave2 (void):      ${wave2Targets.length} targets (delayed +48h)`)
  console.log(`    channels: ${channels.join(', ')}`)
  console.log(`    window: ${startAt.toISOString()} → ${endAt.toISOString()}`)

  return { planId: inserted.id, plan }
}
