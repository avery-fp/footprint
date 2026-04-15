import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * POST /api/analytics
 * 
 * Records a page view for a footprint. Called from the public footprint page
 * to track views. We hash the IP address for unique visitor counting without
 * storing personally identifiable information.
 * 
 * GET /api/analytics?footprint_id=xxx
 * 
 * Retrieves analytics for a footprint (requires ownership).
 * Returns:
 * - Total views
 * - Unique visitors
 * - Views over time (last 30 days)
 * - Top referrers
 */

// Simple hash function for IP addresses
function hashIP(ip: string): string {
  let hash = 0
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * POST - Record a page view
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { footprint_id } = body

    if (!footprint_id) {
      return NextResponse.json({ error: 'footprint_id required' }, { status: 400 })
    }

    // Get IP and user agent for analytics
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown'
    const userAgent = request.headers.get('user-agent') || ''
    const referrer = request.headers.get('referer') || null

    // Hash the IP for privacy
    const viewerHash = hashIP(ip + userAgent.slice(0, 50))

    const supabase = createServerSupabaseClient()

    // Schema drift: the page_views table + increment_view_count RPC were
    // dropped at some point. Page-view counts now live in fp_events with
    // event_type='page_view' (same shape as /api/events writes). The
    // analytics GET below also reads from fp_events.
    await supabase
      .from('fp_events')
      .insert({
        footprint_id,
        event_type: 'page_view',
        data: { visitor_hash: viewerHash },
        referrer,
        user_agent: userAgent.slice(0, 500),
      })

    return NextResponse.json({ success: true })

  } catch (error) {
    // Don't fail the page load if analytics fails
    console.error('Analytics error:', error)
    return NextResponse.json({ success: true })
  }
}

/**
 * GET - Retrieve analytics (authenticated)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const footprintId = searchParams.get('footprint_id')

    if (!footprintId) {
      return NextResponse.json({ error: 'footprint_id required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // footprints.id was dropped — caller now passes user_id as the analytics
    // key. Verify ownership by matching user_id directly.
    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id, serial_number')
      .eq('user_id', footprintId)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Not your footprint' }, { status: 403 })
    }

    // Get total views: count page_view rows in fp_events
    const { count: totalViews } = await supabase
      .from('fp_events')
      .select('id', { count: 'exact', head: true })
      .eq('footprint_id', footprintId)
      .in('event_type', ['visit', 'page_view'])

    // Unique visitors: distinct visitor_hash inside data jsonb
    // Supabase doesn't support DISTINCT through select; pull recent rows + dedupe in JS
    const { data: visitorRows } = await supabase
      .from('fp_events')
      .select('data')
      .eq('footprint_id', footprintId)
      .in('event_type', ['visit', 'page_view'])
      .limit(10000)
    const uniqueVisitors = new Set(
      (visitorRows || []).map((r: any) => r.data?.visitor_hash).filter(Boolean)
    ).size

    // Views by day
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: viewsByDay } = await supabase
      .from('fp_events')
      .select('created_at')
      .eq('footprint_id', footprintId)
      .in('event_type', ['visit', 'page_view'])
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    const dailyViews: Record<string, number> = {}
    viewsByDay?.forEach(view => {
      const date = view.created_at.split('T')[0]
      dailyViews[date] = (dailyViews[date] || 0) + 1
    })

    const viewsOverTime = Object.entries(dailyViews).map(([date, views]) => ({
      date,
      views,
    }))

    // Get top referrers
    const { data: referrerData } = await supabase
      .from('fp_events')
      .select('referrer')
      .eq('footprint_id', footprintId)
      .in('event_type', ['visit', 'page_view'])
      .not('referrer', 'is', null)
      .limit(1000)

    // Aggregate referrers
    const referrerCounts: Record<string, number> = {}
    referrerData?.forEach(row => {
      if (row.referrer) {
        try {
          const url = new URL(row.referrer)
          const domain = url.hostname.replace('www.', '')
          referrerCounts[domain] = (referrerCounts[domain] || 0) + 1
        } catch {
          // Invalid URL, skip
        }
      }
    })

    // Sort and take top 10
    const topReferrers = Object.entries(referrerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }))

    return NextResponse.json({
      total_views: totalViews || 0,
      unique_visitors: uniqueVisitors || 0,
      views_over_time: viewsOverTime,
      top_referrers: topReferrers,
    })

  } catch (error) {
    console.error('Analytics fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
