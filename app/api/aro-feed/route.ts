import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'

/**
 * GET /api/aro-feed
 *
 * Returns JSON feed of analytics data for ARO ingestion.
 * Aggregates: visits, tile_clicks, referrals, conversions.
 *
 * Query params:
 *   since        - ISO date (default: 7 days ago)
 *   footprint_id - optional filter to single footprint
 *   limit        - max events to scan (default: 5000, max: 50000)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const sinceParam = searchParams.get('since')
    const footprintId = searchParams.get('footprint_id')
    const limit = Math.min(
      Number(searchParams.get('limit') || '5000'),
      50000
    )

    const since = sinceParam
      ? new Date(sinceParam)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const supabase = createServerSupabaseClient()

    // Build query with bounded limit
    let query = supabase
      .from('fp_events')
      .select('footprint_id, event_type, event_data, referrer, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })

    if (footprintId) {
      query = query.eq('footprint_id', footprintId)
    }

    const { data: events, error } = await query.limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Collect unique IDs for batch lookup (avoids N+1)
    const fpIds = Array.from(new Set((events || []).map(e => e.footprint_id).filter(Boolean)))

    if (fpIds.length === 0) {
      return NextResponse.json({
        generated_at: new Date().toISOString(),
        period_start: since.toISOString(),
        period_end: new Date().toISOString(),
        total_footprints: 0,
        totals: { visits: 0, tile_clicks: 0, referral_visits: 0, shares: 0, conversions: 0 },
        footprints: [],
      })
    }

    // Parallel batch lookups (not waterfall)
    const [{ data: footprints }, { data: users }] = await Promise.all([
      supabase
        .from('footprints')
        .select('id, username, user_id')
        .in('id', fpIds),
      // We need user_ids — get them from footprints, then batch users.
      // But we don't have user_ids yet. So we do a join approach:
      supabase
        .from('footprints')
        .select('user_id')
        .in('id', fpIds)
        .then(async ({ data: fpRows }) => {
          const userIds = Array.from(new Set((fpRows || []).map(f => f.user_id).filter(Boolean)))
          if (userIds.length === 0) return { data: [] }
          return supabase
            .from('users')
            .select('id, serial_number')
            .in('id', userIds)
        }),
    ])

    const userSerialMap = new Map((users || []).map((u: any) => [u.id, u.serial_number]))
    const fpMeta = new Map((footprints || []).map(f => [
      f.id,
      { slug: f.username, serial: userSerialMap.get(f.user_id) || 0 },
    ]))

    // Aggregate by footprint
    const grouped: Record<string, {
      visits: number
      tile_clicks: number
      referral_visits: number
      shares: number
      conversions: number
      tile_counts: Record<string, number>
      referrer_counts: Record<string, number>
      daily: Record<string, { visits: number; clicks: number }>
    }> = {}

    for (const event of (events || [])) {
      const fpId = event.footprint_id
      if (!grouped[fpId]) {
        grouped[fpId] = {
          visits: 0,
          tile_clicks: 0,
          referral_visits: 0,
          shares: 0,
          conversions: 0,
          tile_counts: {},
          referrer_counts: {},
          daily: {},
        }
      }

      const g = grouped[fpId]
      const date = event.created_at.split('T')[0]

      if (!g.daily[date]) g.daily[date] = { visits: 0, clicks: 0 }

      switch (event.event_type) {
        case 'visit':
          g.visits++
          g.daily[date].visits++
          break
        case 'tile_click':
          g.tile_clicks++
          g.daily[date].clicks++
          if (event.event_data?.tile_id) {
            const tid = event.event_data.tile_id
            g.tile_counts[tid] = (g.tile_counts[tid] || 0) + 1
          }
          break
        case 'referral_visit':
          g.referral_visits++
          break
        case 'share':
          g.shares++
          break
        case 'conversion':
          g.conversions++
          break
      }

      if (event.referrer) {
        try {
          const domain = new URL(event.referrer).hostname.replace('www.', '')
          g.referrer_counts[domain] = (g.referrer_counts[domain] || 0) + 1
        } catch { /* ignore bad URLs */ }
      }
    }

    // Format output
    const footprintFeed = Object.entries(grouped).map(([fpId, g]) => {
      const meta = fpMeta.get(fpId)

      const topTiles = Object.entries(g.tile_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tile_id, clicks]) => ({ tile_id, clicks }))

      const topReferrers = Object.entries(g.referrer_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => ({ domain, count }))

      const daily = Object.entries(g.daily)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, d]) => ({ date, visits: d.visits, clicks: d.clicks }))

      return {
        footprint_id: fpId,
        slug: meta?.slug || 'unknown',
        serial: meta?.serial || 0,
        visits: g.visits,
        tile_clicks: g.tile_clicks,
        referral_visits: g.referral_visits,
        shares: g.shares,
        conversions: g.conversions,
        top_tiles: topTiles,
        top_referrers: topReferrers,
        daily,
      }
    })

    footprintFeed.sort((a, b) => b.visits - a.visits)

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      period_start: since.toISOString(),
      period_end: new Date().toISOString(),
      total_footprints: footprintFeed.length,
      event_count: (events || []).length,
      truncated: (events || []).length >= limit,
      totals: {
        visits: footprintFeed.reduce((s, f) => s + f.visits, 0),
        tile_clicks: footprintFeed.reduce((s, f) => s + f.tile_clicks, 0),
        referral_visits: footprintFeed.reduce((s, f) => s + f.referral_visits, 0),
        shares: footprintFeed.reduce((s, f) => s + f.shares, 0),
        conversions: footprintFeed.reduce((s, f) => s + f.conversions, 0),
      },
      footprints: footprintFeed,
    })
  } catch (error: any) {
    console.error('ARO feed error:', error)
    return NextResponse.json({ error: error?.message || 'Feed generation failed' }, { status: 500 })
  }
}
