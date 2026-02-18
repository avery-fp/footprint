import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/pulse
 *
 * Returns live social proof data for the homepage and checkout:
 * - Next serial number (scarcity)
 * - Total claimed (social proof)
 * - Recent buyers (anonymized)
 *
 * Public, cached 30s at edge.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()

    // Next available serial
    const { data: nextSerial } = await supabase
      .from('serials')
      .select('number')
      .eq('is_assigned', false)
      .order('number')
      .limit(1)
      .single()

    // Total claimed
    const { count: totalClaimed } = await supabase
      .from('serials')
      .select('id', { count: 'exact', head: true })
      .eq('is_assigned', true)

    // Recent buyers (last 5, anonymized — just serial + time)
    const { data: recent } = await supabase
      .from('users')
      .select('serial_number, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    const recentBuyers = (recent || []).map(u => ({
      serial: u.serial_number,
      ago: timeSince(new Date(u.created_at)),
    }))

    // Serials remaining (out of initial 10k pool)
    const remaining = nextSerial ? 17776 - nextSerial.number + 1 : 0

    return NextResponse.json({
      next_serial: nextSerial?.number || 7777,
      total_claimed: totalClaimed || 0,
      remaining,
      recent: recentBuyers,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('Pulse error:', error)
    return NextResponse.json({
      next_serial: 7777,
      total_claimed: 0,
      remaining: 10000,
      recent: [],
    })
  }
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
