import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/aro/track
 *
 * Records a UTM-tagged visit for distribution attribution.
 * Called from the client-side AnalyticsTracker when UTM params are present.
 *
 * Also increments clicks on matching distribution events.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { footprint_id, serial_number, utm_pack, utm_channel, utm_surface } =
      body

    if (!footprint_id || !serial_number) {
      return NextResponse.json(
        { error: 'footprint_id and serial_number required' },
        { status: 400 }
      )
    }

    // Need at least one UTM param
    if (!utm_pack && !utm_channel) {
      return NextResponse.json(
        { error: 'At least utm_pack or utm_channel required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Generate a visitor hash from headers (privacy-preserving)
    const forwarded = request.headers.get('x-forwarded-for') || ''
    const ua = request.headers.get('user-agent') || ''
    const visitorHash = await hashString(`${forwarded}-${ua}`)

    // 1. Record the UTM visit
    await supabase.from('fp_utm_visits').insert({
      footprint_id,
      serial_number,
      utm_pack: utm_pack || null,
      utm_channel: utm_channel || null,
      utm_surface: utm_surface || null,
      visitor_hash: visitorHash,
    })

    // 2. Increment clicks on matching distribution events
    if (utm_pack && utm_channel) {
      // Find matching event and increment clicks
      const { data: matchingEvents } = await supabase
        .from('fp_distribution_events')
        .select('id, clicks')
        .eq('pack_id', utm_pack)
        .eq('channel', utm_channel)
        .order('posted_at', { ascending: false })
        .limit(1)

      if (matchingEvents && matchingEvents.length > 0) {
        const event = matchingEvents[0]
        await supabase
          .from('fp_distribution_events')
          .update({ clicks: (event.clicks || 0) + 1 })
          .eq('id', event.id)
      }
    }

    return NextResponse.json({ tracked: true })
  } catch (error: any) {
    // Tracking should never fail loudly
    console.error('UTM track error:', error)
    return NextResponse.json({ tracked: false })
  }
}

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
