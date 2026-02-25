import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { eventsSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/events')

/**
 * POST /api/events
 *
 * Records an analytics event for a footprint.
 * Event types: visit, tile_click, referral_visit, share, conversion
 *
 * Body: {
 *   footprint_id: string
 *   event_type: string
 *   event_data?: object   // tile_id, referrer_code, platform, etc.
 * }
 *
 * Public endpoint — fires from client components on public pages.
 */

function hashIP(ip: string): string {
  let hash = 0
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(eventsSchema, body)
    if (!v.success) return v.response
    const { footprint_id, event_type, event_data } = v.data

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown'
    const userAgent = request.headers.get('user-agent') || ''
    const referrer = request.headers.get('referer') || null

    const visitorHash = hashIP(ip + userAgent.slice(0, 50))

    const supabase = createServerSupabaseClient()

    await supabase.from('fp_events').insert({
      footprint_id,
      event_type,
      event_data: event_data || {},
      visitor_hash: visitorHash,
      referrer,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    log.error({ err: error }, 'Event tracking failed')
    return NextResponse.json({ ok: true })
  }
}
