import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

/**
 * GET /api/aro/stats
 *
 * Returns conversion data grouped by channel, surface, pack_id.
 * Shows which placements are performing.
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 * Optional filters: ?channel=reddit&pack_id=nba-allstar&days=7
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const channel = searchParams.get('channel')
    const packId = searchParams.get('pack_id')
    const days = parseInt(searchParams.get('days') || '30', 10)

    const supabase = createServerSupabaseClient()

    // Build query
    let query = supabase
      .from('fp_distribution_events')
      .select('*')
      .gte(
        'posted_at',
        new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('posted_at', { ascending: false })

    if (channel) query = query.eq('channel', channel)
    if (packId) query = query.eq('pack_id', packId)

    const { data: events, error } = await query.limit(5000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const allEvents = events || []

    // Aggregate by channel
    const byChannel: Record<
      string,
      { posts: number; clicks: number; conversions: number }
    > = {}
    for (const e of allEvents) {
      const ch = e.channel || 'unknown'
      if (!byChannel[ch])
        byChannel[ch] = { posts: 0, clicks: 0, conversions: 0 }
      byChannel[ch].posts++
      byChannel[ch].clicks += e.clicks || 0
      byChannel[ch].conversions += e.conversions || 0
    }

    // Aggregate by pack
    const byPack: Record<
      string,
      { posts: number; clicks: number; conversions: number }
    > = {}
    for (const e of allEvents) {
      const pk = e.pack_id || 'untagged'
      if (!byPack[pk]) byPack[pk] = { posts: 0, clicks: 0, conversions: 0 }
      byPack[pk].posts++
      byPack[pk].clicks += e.clicks || 0
      byPack[pk].conversions += e.conversions || 0
    }

    // Top surfaces by clicks
    const bySurface: Record<
      string,
      { posts: number; clicks: number; conversions: number }
    > = {}
    for (const e of allEvents) {
      const sf = e.surface || 'untagged'
      if (!bySurface[sf])
        bySurface[sf] = { posts: 0, clicks: 0, conversions: 0 }
      bySurface[sf].posts++
      bySurface[sf].clicks += e.clicks || 0
      bySurface[sf].conversions += e.conversions || 0
    }

    // Totals
    const totals = {
      posts: allEvents.length,
      clicks: allEvents.reduce((sum, e) => sum + (e.clicks || 0), 0),
      conversions: allEvents.reduce(
        (sum, e) => sum + (e.conversions || 0),
        0
      ),
    }

    return NextResponse.json({
      totals,
      by_channel: byChannel,
      by_pack: byPack,
      by_surface: bySurface,
      recent: allEvents.slice(0, 20),
      days,
    })
  } catch (error: any) {
    console.error('ARO stats error:', error)
    return NextResponse.json(
      { error: error?.message || 'Stats fetch failed' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/aro/stats
 *
 * Record a deployment event (mark something as posted).
 * Body: { serial_number, channel, surface?, pack_id?, placement_url?, caption_tone?, room_id?, notes? }
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      serial_number,
      channel,
      surface,
      pack_id,
      placement_url,
      caption_tone,
      room_id,
      notes,
    } = body

    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    if (!serial_number || !channel) {
      return NextResponse.json(
        { error: 'serial_number and channel required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: event, error } = await supabase
      .from('fp_distribution_events')
      .insert({
        serial_number,
        room_id: room_id || null,
        pack_id: pack_id || null,
        channel,
        surface: surface || null,
        placement_url: placement_url || null,
        caption_tone: caption_tone || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ event })
  } catch (error: any) {
    console.error('ARO stats POST error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to record event' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/aro/stats
 *
 * Update an event (e.g., add placement_url after posting, increment clicks).
 * Body: { event_id, placement_url?, clicks?, conversions?, notes? }
 *
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { event_id, placement_url, clicks, conversions, notes } = body

    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    if (!event_id) {
      return NextResponse.json(
        { error: 'event_id required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    const updates: Record<string, any> = {}
    if (placement_url !== undefined) updates.placement_url = placement_url
    if (clicks !== undefined) updates.clicks = clicks
    if (conversions !== undefined) updates.conversions = conversions
    if (notes !== undefined) updates.notes = notes

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data: event, error } = await supabase
      .from('fp_distribution_events')
      .update(updates)
      .eq('id', event_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ event })
  } catch (error: any) {
    console.error('ARO stats PATCH error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update event' },
      { status: 500 }
    )
  }
}
