import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ARO admin secret — the single-user JWT gate is gone. Set
// ARO_ADMIN_SECRET in env and pass it as the fp_admin cookie to access.
const ARO_ADMIN_COOKIE = 'fp_admin'

interface Stats {
  sent: number
  clicks: number
  converts: number
  rate: number
}

function newStats(): Stats {
  return { sent: 0, clicks: 0, converts: 0, rate: 0 }
}

export default async function ARODashboard() {
  // ── Admin gate: fp_admin cookie must match ARO_ADMIN_SECRET env var ──
  const cookieStore = await cookies()
  const adminCookie = cookieStore.get(ARO_ADMIN_COOKIE)?.value
  const expected = process.env.ARO_ADMIN_SECRET

  if (!expected || !adminCookie || adminCookie !== expected) {
    redirect('/')
  }

  const supabase = createServerSupabaseClient()

  // Fetch counts
  const [targetsRes, messagesRes, eventsRes, serialsRes] = await Promise.all([
    supabase.from('targets').select('id', { count: 'exact', head: true }),
    supabase.from('aro_messages').select('id', { count: 'exact', head: true }),
    supabase.from('aro_events').select('id', { count: 'exact', head: true }),
    supabase.from('aro_serials').select('id', { count: 'exact', head: true }).not('assigned_target_id', 'is', null),
  ])

  const targetCount = targetsRes.count || 0
  const messageCount = messagesRes.count || 0
  const eventCount = eventsRes.count || 0
  const serialsAssigned = serialsRes.count || 0

  // Fetch events for lift computation
  const { data: events } = await supabase
    .from('aro_events')
    .select('event_type, channel, target_id, message_id')

  const { data: messages } = await supabase
    .from('aro_messages')
    .select('id, variant_id')

  const { data: targets } = await supabase
    .from('targets')
    .select('id, layer, category_id')

  const { data: variants } = await supabase
    .from('message_variants')
    .select('id, name')

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')

  // Build lookups
  const msgMap = new Map((messages || []).map(m => [m.id, m]))
  const targetMap = new Map((targets || []).map(t => [t.id, t]))
  const variantMap = new Map((variants || []).map(v => [v.id, v]))
  const catMap = new Map((categories || []).map(c => [c.id, c]))

  // Compute lift tables
  const byLayer: Record<number, Stats> = {}
  const byCategory: Record<string, Stats> = {}
  const byVariant: Record<string, Stats> = {}
  const byChannel: Record<string, Stats> = {}

  let totalClicks = 0
  let totalConverts = 0

  for (const e of events || []) {
    const target = e.target_id ? targetMap.get(e.target_id) : null
    const msg = e.message_id ? msgMap.get(e.message_id) : null
    const variant = msg?.variant_id ? variantMap.get(msg.variant_id) : null
    const category = target?.category_id ? catMap.get(target.category_id) : null

    const layer = target?.layer || 0
    const catName = category?.name || 'unknown'
    const varName = variant?.name || 'unknown'
    const channel = e.channel || 'unknown'

    if (!byLayer[layer]) byLayer[layer] = newStats()
    if (!byCategory[catName]) byCategory[catName] = newStats()
    if (!byVariant[varName]) byVariant[varName] = newStats()
    if (!byChannel[channel]) byChannel[channel] = newStats()

    const increment = (s: Stats) => {
      if (e.event_type === 'sent') s.sent++
      if (e.event_type === 'click') { s.clicks++; totalClicks++ }
      if (e.event_type === 'convert') { s.converts++; totalConverts++ }
    }

    increment(byLayer[layer])
    increment(byCategory[catName])
    increment(byVariant[varName])
    increment(byChannel[channel])
  }

  const computeRate = (s: Stats) => {
    s.rate = s.sent > 0 ? s.converts / s.sent : 0
  }
  Object.values(byLayer).forEach(computeRate)
  Object.values(byCategory).forEach(computeRate)
  Object.values(byVariant).forEach(computeRate)
  Object.values(byChannel).forEach(computeRate)

  // Serial velocity
  const { data: recentSerials } = await supabase
    .from('aro_serials')
    .select('created_at, claimed')
    .not('assigned_target_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  const claimedCount = (recentSerials || []).filter(s => s.claimed).length
  const claimRate = recentSerials && recentSerials.length > 0
    ? (claimedCount / recentSerials.length * 100).toFixed(1)
    : '0'

  // Void layer comparison
  const voidStats = byLayer[6] || newStats()
  const mainStats = byLayer[5] || byLayer[4] || byLayer[3] || newStats()

  return (
    <div className="min-h-screen bg-black text-white p-6 font-mono">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">ARO Intelligence Dashboard</h1>
        <p className="text-zinc-500 mb-8 text-sm">footprint.site distribution brain</p>

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <StatCard label="Targets" value={targetCount} />
          <StatCard label="Messages" value={messageCount} />
          <StatCard label="Clicks" value={totalClicks} />
          <StatCard label="Conversions" value={totalConverts} />
          <StatCard label="Revenue Est." value={`$${totalConverts * 10}`} />
        </div>

        {/* Serial velocity */}
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-3 text-zinc-300">Serial Velocity</h2>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Assigned" value={serialsAssigned} />
            <StatCard label="Assigned/Day" value={serialsAssigned > 0 ? Math.ceil(serialsAssigned / Math.max(1, daysSinceFirst(recentSerials))) : 0} />
            <StatCard label="Claim Rate" value={`${claimRate}%`} />
          </div>
        </div>

        {/* Performance by Layer */}
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-3 text-zinc-300">Performance by Layer</h2>
          <PerfTable data={byLayer} keyLabel="Layer" />
        </div>

        {/* Performance by Category */}
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-3 text-zinc-300">Performance by Category</h2>
          <PerfTable data={byCategory} keyLabel="Category" />
        </div>

        {/* Performance by Variant */}
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-3 text-zinc-300">Performance by Variant</h2>
          <PerfTable data={byVariant} keyLabel="Variant" />
        </div>

        {/* Performance by Channel */}
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-3 text-zinc-300">Performance by Channel</h2>
          <PerfTable data={byChannel} keyLabel="Channel" />
        </div>

        {/* Void layer comparison */}
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-3 text-zinc-300">Void Layer Comparison</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-zinc-500 mb-1">Main Layers (3-5)</p>
                <p className="text-xl">{(mainStats.rate * 100).toFixed(2)}% conv</p>
                <p className="text-zinc-500">{mainStats.sent} sent / {mainStats.converts} converts</p>
              </div>
              <div>
                <p className="text-zinc-500 mb-1">Void Layer (6)</p>
                <p className="text-xl">{(voidStats.rate * 100).toFixed(2)}% conv</p>
                <p className="text-zinc-500">{voidStats.sent} sent / {voidStats.converts} converts</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-zinc-600 text-xs mt-8">
          Updated: {new Date().toISOString()} | Events: {eventCount} | This system plans + learns. Execution is external/compliant.
        </p>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function PerfTable({ data, keyLabel }: { data: Record<string | number, Stats>; keyLabel: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1].rate - a[1].rate)

  if (entries.length === 0) {
    return <p className="text-zinc-600 text-sm">No data yet. Run <code>npm run aro</code> and ingest events.</p>
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="text-left p-3">{keyLabel}</th>
            <th className="text-right p-3">Sent</th>
            <th className="text-right p-3">Clicks</th>
            <th className="text-right p-3">Converts</th>
            <th className="text-right p-3">Rate</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, stats]) => (
            <tr key={key} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="p-3 font-medium">{key}</td>
              <td className="p-3 text-right text-zinc-400">{stats.sent}</td>
              <td className="p-3 text-right text-zinc-400">{stats.clicks}</td>
              <td className="p-3 text-right text-zinc-400">{stats.converts}</td>
              <td className="p-3 text-right font-bold">{(stats.rate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function daysSinceFirst(serials: { created_at: string }[] | null): number {
  if (!serials || serials.length === 0) return 1
  const oldest = new Date(serials[serials.length - 1].created_at)
  const now = new Date()
  return Math.max(1, Math.ceil((now.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24)))
}
