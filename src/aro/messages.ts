/**
 * ARO Messages Module — WHAT to say
 *
 * Rules:
 *   - 15 words max
 *   - Must include serial like "#12345"
 *   - Must include "footprint.site"
 *   - Minimal monolith vibe (no cringe)
 *
 * No platform interaction. Just generates message rows.
 */

import { createClient } from '@supabase/supabase-js'
import type { MessageVariant, Target } from './types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Default message variant templates ─────────────────────

const DEFAULT_VARIANTS: Omit<MessageVariant, 'id' | 'created_at'>[] = [
  // Layer 1 — Aesthetic matches
  { name: 'aesthetic_cold', layer: 1, category_id: null, template: 'your taste deserves a room. #{serial} — footprint.site', max_words: 15, active: true },
  { name: 'aesthetic_warm', layer: 1, category_id: null, template: 'built for curators. #{serial} footprint.site', max_words: 15, active: true },
  { name: 'aesthetic_direct', layer: 1, category_id: null, template: '#{serial} — your internet, designed. footprint.site', max_words: 15, active: true },

  // Layer 2 — Mega accounts
  { name: 'mega_respect', layer: 2, category_id: null, template: 'your page inspired this. #{serial} footprint.site', max_words: 15, active: true },
  { name: 'mega_simple', layer: 2, category_id: null, template: '#{serial} footprint.site — identity rooms.', max_words: 15, active: true },

  // Layer 3 — Category leaders
  { name: 'niche_authority', layer: 3, category_id: null, template: 'made for pages like yours. #{serial} footprint.site', max_words: 15, active: true },
  { name: 'niche_invite', layer: 3, category_id: null, template: 'room #{serial} is yours if you want it. footprint.site', max_words: 15, active: true },

  // Layer 4 — Based accounts
  { name: 'based_minimal', layer: 4, category_id: null, template: '#{serial}. footprint.site', max_words: 15, active: true },
  { name: 'based_taste', layer: 4, category_id: null, template: 'taste is the product. #{serial} footprint.site', max_words: 15, active: true },

  // Layer 5 — Link-in-bio users
  { name: 'lib_upgrade', layer: 5, category_id: null, template: 'upgrade your link. #{serial} footprint.site — $10.', max_words: 15, active: true },
  { name: 'lib_replace', layer: 5, category_id: null, template: 'not a linktree. a footprint. #{serial} footprint.site', max_words: 15, active: true },
  { name: 'lib_visual', layer: 5, category_id: null, template: 'your bio link, but beautiful. #{serial} footprint.site', max_words: 15, active: true },

  // Layer 6 — Void layer
  { name: 'void_whisper', layer: 6, category_id: null, template: '#{serial} footprint.site', max_words: 15, active: true },
  { name: 'void_delayed', layer: 6, category_id: null, template: 'room #{serial}. footprint.site — when you\'re ready.', max_words: 15, active: true },
]

// ─── Seed default variants ─────────────────────────────────

export async function seedMessageVariants(): Promise<{ seeded: number }> {
  const supabase = getSupabase()

  // Check if already seeded
  const { count } = await supabase
    .from('message_variants')
    .select('id', { count: 'exact', head: true })

  if (count && count > 0) {
    console.log(`  [messages] ${count} variants already exist, skipping seed`)
    return { seeded: 0 }
  }

  const { error } = await supabase
    .from('message_variants')
    .insert(DEFAULT_VARIANTS)

  if (error) {
    console.log(`  [messages] seed error: ${error.message}`)
    return { seeded: 0 }
  }

  console.log(`  [messages] seeded ${DEFAULT_VARIANTS.length} default variants`)
  return { seeded: DEFAULT_VARIANTS.length }
}

// ─── Generate messages for targets ─────────────────────────

export async function generateMessages(opts: {
  channel: string
  planWindowHours?: number
  perTargetVariants?: number
}): Promise<{ generated: number }> {
  const supabase = getSupabase()
  const { channel, perTargetVariants = 1 } = opts

  // Get active variants
  const { data: variants } = await supabase
    .from('message_variants')
    .select('*')
    .eq('active', true)

  if (!variants || variants.length === 0) {
    console.log('  [messages] no active variants found')
    return { generated: 0 }
  }

  // Get targets that don't have messages yet for this channel
  const { data: existingTargetIds } = await supabase
    .from('aro_messages')
    .select('target_id')
    .eq('channel', channel)

  const excludeIds = new Set((existingTargetIds || []).map(r => r.target_id))

  const { data: targets } = await supabase
    .from('targets')
    .select('id, layer, category_id, username')
    .eq('status', 'new')
    .order('conversion_probability', { ascending: false })

  if (!targets || targets.length === 0) {
    console.log('  [messages] no eligible targets')
    return { generated: 0 }
  }

  const eligible = targets.filter(t => !excludeIds.has(t.id))
  console.log(`  [messages] generating for ${eligible.length} targets on ${channel}`)

  const messages: {
    target_id: string
    serial_number: number
    variant_id: string
    body: string
    channel: string
  }[] = []

  for (const target of eligible) {
    // Pick variant matching target's layer
    const layerVariants = variants.filter(v => v.layer === target.layer)
    const pool = layerVariants.length > 0 ? layerVariants : variants

    // Generate N variants per target
    for (let i = 0; i < Math.min(perTargetVariants, pool.length); i++) {
      const variant = pool[i % pool.length]

      // Get next serial
      const { data: serialResult } = await supabase.rpc('next_serial')
      const serial = serialResult as number

      if (!serial) {
        console.log('  [messages] serial pool exhausted')
        break
      }

      // Assign serial to target
      await supabase
        .from('aro_serials')
        .update({ assigned_target_id: target.id })
        .eq('serial_number', serial)

      // Render template
      const body = variant.template
        .replace('#{serial}', `#${serial}`)

      messages.push({
        target_id: target.id,
        serial_number: serial,
        variant_id: variant.id,
        body,
        channel,
      })
    }
  }

  // Batch insert
  if (messages.length > 0) {
    const BATCH = 200
    for (let i = 0; i < messages.length; i += BATCH) {
      const { error } = await supabase
        .from('aro_messages')
        .insert(messages.slice(i, i + BATCH))

      if (error) {
        console.log(`  [messages] insert error: ${error.message}`)
      }
    }
  }

  console.log(`  [messages] generated ${messages.length} messages`)
  return { generated: messages.length }
}
