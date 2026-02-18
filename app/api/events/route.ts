import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

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

const VALID_EVENTS = ['visit', 'tile_click', 'referral_visit', 'share', 'conversion']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { footprint_id, event_type, event_data } = body

    if (!footprint_id || !event_type) {
      return NextResponse.json({ error: 'footprint_id and event_type required' }, { status: 400 })
    }

    if (!VALID_EVENTS.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
    }

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
    console.error('Event tracking error:', error)
    return NextResponse.json({ ok: true })
  }
}
