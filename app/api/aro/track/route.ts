import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/aro/track
 *
 * Records a UTM-tagged visit for distribution attribution.
 * Called from the client-side AnalyticsTracker when UTM params are present.
 *
 * Also atomically increments clicks on matching distribution events.
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

    if (!utm_pack && !utm_channel) {
      return NextResponse.json(
        { error: 'At least utm_pack or utm_channel required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Privacy-preserving visitor hash
    const forwarded = request.headers.get('x-forwarded-for') || ''
    const ua = request.headers.get('user-agent') || ''
    const visitorHash = await hashString(`${forwarded}-${ua}`)

    // 1. Record the UTM visit
    const { error: visitErr } = await supabase.from('fp_utm_visits').insert({
      footprint_id,
      serial_number,
      utm_pack: utm_pack || null,
      utm_channel: utm_channel || null,
      utm_surface: utm_surface || null,
      visitor_hash: visitorHash,
    })

    if (visitErr) {
      console.error('UTM visit insert error:', visitErr.message)
    }

    // 2. Atomic click increment on matching distribution event (no read-then-write race)
    if (utm_pack && utm_channel) {
      const { error: rpcErr } = await supabase.rpc('aro_increment_clicks', {
        p_pack_id: utm_pack,
        p_channel: utm_channel,
      })

      if (rpcErr) {
        // Non-fatal: RPC may not exist yet in older deployments
        console.error('Click increment RPC error:', rpcErr.message)
      }
    }

    return NextResponse.json({ tracked: true })
  } catch (error: any) {
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
