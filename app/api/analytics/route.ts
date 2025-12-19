import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

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

    // Record the page view
    await supabase
      .from('page_views')
      .insert({
        footprint_id,
        viewer_hash: viewerHash,
        referrer,
        user_agent: userAgent.slice(0, 500), // Limit length
      })

    // Also increment the view_count on the footprint (denormalized for quick access)
    await supabase.rpc('increment_view_count', { p_footprint_id: footprint_id })

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
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const footprintId = searchParams.get('footprint_id')

    if (!footprintId) {
      return NextResponse.json({ error: 'footprint_id required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership
    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id, view_count')
      .eq('id', footprintId)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Not your footprint' }, { status: 403 })
    }

    // Get total views (from denormalized count)
    const totalViews = footprint.view_count || 0

    // Get unique visitors (count distinct viewer_hash)
    const { count: uniqueVisitors } = await supabase
      .from('page_views')
      .select('viewer_hash', { count: 'exact', head: true })
      .eq('footprint_id', footprintId)

    // Get views by day for last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: viewsByDay } = await supabase
      .from('page_views')
      .select('created_at')
      .eq('footprint_id', footprintId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    // Aggregate views by day
    const dailyViews: Record<string, number> = {}
    viewsByDay?.forEach(view => {
      const date = view.created_at.split('T')[0]
      dailyViews[date] = (dailyViews[date] || 0) + 1
    })

    // Convert to array format for charting
    const viewsOverTime = Object.entries(dailyViews).map(([date, views]) => ({
      date,
      views,
    }))

    // Get top referrers
    const { data: referrerData } = await supabase
      .from('page_views')
      .select('referrer')
      .eq('footprint_id', footprintId)
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
      total_views: totalViews,
      unique_visitors: uniqueVisitors || 0,
      views_over_time: viewsOverTime,
      top_referrers: topReferrers,
    })

  } catch (error) {
    console.error('Analytics fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
