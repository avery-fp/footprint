/**
 * DEPLOY AGENT — Places postpacks on surfaces.
 *
 * Records deployment events via POST /api/aro/stats.
 * Returns event IDs for tracking conversions.
 *
 * Does not actually post to platforms (that requires platform OAuth).
 * Instead, it:
 *   1. Records the deployment intent
 *   2. Outputs the content + metadata ready for posting
 *   3. Tracks placement URLs when provided
 */

import { getConfig } from '../env.js'
import type { PostpackContent, DeployMeta, DeployResult } from '../types.js'

// ─── Record deployment ──────────────────────────────────

async function recordEvent(
  content: PostpackContent,
  meta: DeployMeta
): Promise<DeployResult> {
  const config = getConfig()

  const response = await fetch(`${config.FP_BASE_URL}/api/aro/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aro_key: config.ARO_KEY,
      serial_number: meta.serial_number,
      room_id: meta.room_id,
      channel: content.surface,
      surface: content.surface,
      pack_id: meta.pack_id || null,
      caption_tone: content.caption.slice(0, 100),
      notes: `auto-deployed via culture pipeline | hashtags: ${content.hashtags.join(', ')}`,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Stats API error ${response.status}: ${text}`)
  }

  const data = await response.json()

  return {
    event_id: data.event?.id || 'unknown',
    surface: content.surface,
    channel: content.surface,
  }
}

// ─── Update with placement URL ──────────────────────────

export async function updatePlacement(
  eventId: string,
  placementUrl: string
): Promise<void> {
  const config = getConfig()

  await fetch(`${config.FP_BASE_URL}/api/aro/stats`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aro_key: config.ARO_KEY,
      event_id: eventId,
      placement_url: placementUrl,
    }),
  })
}

// ─── Main: place ────────────────────────────────────────

export async function place(
  content: PostpackContent,
  meta: DeployMeta
): Promise<DeployResult> {
  console.log(`  [deploy] recording ${content.surface} deployment...`)

  const result = await recordEvent(content, meta)

  console.log(`  [deploy] event ${result.event_id} recorded for ${result.surface}`)
  return result
}

/**
 * Deploy all postpacks for a single room.
 */
export async function placeAll(
  packs: PostpackContent[],
  meta: DeployMeta
): Promise<DeployResult[]> {
  console.log(`  [deploy] deploying ${packs.length} postpacks...`)

  const results: DeployResult[] = []

  // Deploy sequentially to avoid rate limits
  for (const pack of packs) {
    try {
      const result = await place(pack, meta)
      results.push(result)
    } catch (err: any) {
      console.error(`  [deploy] failed for ${pack.surface}: ${err.message}`)
    }
  }

  console.log(`  [deploy] ${results.length}/${packs.length} deployments recorded`)
  return results
}
