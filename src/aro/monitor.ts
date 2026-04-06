/**
 * MONITOR — Autonomic Nervous System
 *
 * Watches SES delivery metrics and auto-adjusts sending behavior:
 * - Tracks bounce rates per domain/region
 * - Auto-pauses domains exceeding 5% bounce rate
 * - Auto-pauses domains exceeding 0.1% complaint rate
 * - Advances warmup schedule for healthy domains
 * - Logs health snapshots for observability
 *
 * This is the immune system. It protects sending reputation.
 */

import { getSupabase } from './lib/supabase'
import type { SwarmDomain } from './types'

// ─── Thresholds ───────────────────────────────────────────

const BOUNCE_RATE_PAUSE = 0.05   // 5% bounce rate → pause domain
const COMPLAINT_RATE_PAUSE = 0.001 // 0.1% complaint rate → pause domain
const MIN_SENDS_FOR_RATE = 20    // need at least 20 sends to compute rate

// ─── Process bounce/complaint notifications ───────────────

export interface MonitorResult {
  domainsChecked: number
  domainsPaused: number
  domainsAdvanced: number
  totalBounces: number
  totalComplaints: number
  alerts: string[]
}

export async function runMonitorCycle(): Promise<MonitorResult> {
  const supabase = getSupabase()
  const alerts: string[] = []
  let domainsPaused = 0
  let domainsAdvanced = 0
  let totalBounces = 0
  let totalComplaints = 0

  // Get all active/warming domains
  const { data: domains } = await supabase
    .from('swarm_domains')
    .select('*')
    .in('status', ['warming', 'active'])

  if (!domains || domains.length === 0) {
    return { domainsChecked: 0, domainsPaused: 0, domainsAdvanced: 0, totalBounces: 0, totalComplaints: 0, alerts: [] }
  }

  console.log(`  [monitor] checking ${domains.length} domains`)

  for (const domain of domains as SwarmDomain[]) {
    // Count recent bounces and complaints from swarm_sends
    const { count: bounceCount } = await supabase
      .from('swarm_sends')
      .select('id', { count: 'exact', head: true })
      .eq('from_domain', domain.domain)
      .eq('status', 'bounced')
      .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const { count: complaintCount } = await supabase
      .from('swarm_sends')
      .select('id', { count: 'exact', head: true })
      .eq('from_domain', domain.domain)
      .eq('status', 'complained')
      .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    const bounces = bounceCount || 0
    const complaints = complaintCount || 0
    totalBounces += bounces
    totalComplaints += complaints

    // Update domain bounce/complaint counts
    await supabase.from('swarm_domains').update({
      bounced_today: bounces,
      complained_today: complaints,
    }).eq('id', domain.id)

    // Compute rates
    if (domain.sent_today >= MIN_SENDS_FOR_RATE) {
      const bounceRate = bounces / domain.sent_today
      const complaintRate = complaints / domain.sent_today

      await supabase.from('swarm_domains').update({
        bounce_rate: bounceRate,
        complaint_rate: complaintRate,
      }).eq('id', domain.id)

      // Check bounce rate threshold
      if (bounceRate >= BOUNCE_RATE_PAUSE) {
        await supabase.from('swarm_domains').update({ status: 'paused' }).eq('id', domain.id)
        const alert = `PAUSED ${domain.domain}: bounce rate ${(bounceRate * 100).toFixed(1)}% (${bounces}/${domain.sent_today})`
        alerts.push(alert)
        console.log(`  [monitor] ${alert}`)
        domainsPaused++
        continue
      }

      // Check complaint rate threshold
      if (complaintRate >= COMPLAINT_RATE_PAUSE) {
        await supabase.from('swarm_domains').update({ status: 'paused' }).eq('id', domain.id)
        const alert = `PAUSED ${domain.domain}: complaint rate ${(complaintRate * 100).toFixed(2)}% (${complaints}/${domain.sent_today})`
        alerts.push(alert)
        console.log(`  [monitor] ${alert}`)
        domainsPaused++
        continue
      }
    }

    // Advance warmup if domain is healthy and sent enough today
    if (domain.status === 'warming' && domain.sent_today >= domain.daily_limit * 0.8) {
      const newDay = domain.warmup_day + 1
      const updates: Partial<SwarmDomain> = { warmup_day: newDay }

      // Graduate to active after day 20
      if (newDay > 20) {
        updates.status = 'active'
        updates.daily_limit = 50000
        console.log(`  [monitor] ${domain.domain} graduated to ACTIVE`)
      }

      await supabase.from('swarm_domains').update(updates).eq('id', domain.id)
      domainsAdvanced++
    }

    console.log(`  [monitor] ${domain.domain}: ${domain.sent_today} sent, ${bounces} bounced, ${complaints} complaints (day ${domain.warmup_day})`)
  }

  return {
    domainsChecked: domains.length,
    domainsPaused,
    domainsAdvanced,
    totalBounces,
    totalComplaints,
    alerts,
  }
}

// ─── Process individual bounce/complaint events ───────────

export async function recordBounce(sesMessageId: string): Promise<void> {
  const supabase = getSupabase()

  // Find the send record
  const { data: send } = await supabase
    .from('swarm_sends')
    .select('id, target_id, from_domain')
    .eq('ses_message_id', sesMessageId)
    .single()

  if (!send) return

  // Update send status
  await supabase.from('swarm_sends').update({
    status: 'bounced',
    bounced_at: new Date().toISOString(),
  }).eq('id', send.id)

  // Update target status
  await supabase.from('swarm_targets').update({ status: 'bounced' }).eq('id', send.target_id)

  // Increment domain bounce counter
  const { data: domainData } = await supabase
    .from('swarm_domains')
    .select('bounced_today')
    .eq('domain', send.from_domain)
    .single()

  if (domainData) {
    await supabase.from('swarm_domains')
      .update({ bounced_today: (domainData.bounced_today || 0) + 1 })
      .eq('domain', send.from_domain)
  }
}

export async function recordComplaint(sesMessageId: string): Promise<void> {
  const supabase = getSupabase()

  const { data: send } = await supabase
    .from('swarm_sends')
    .select('id, target_id, from_domain')
    .eq('ses_message_id', sesMessageId)
    .single()

  if (!send) return

  await supabase.from('swarm_sends').update({
    status: 'complained',
  }).eq('id', send.id)

  await supabase.from('swarm_targets').update({ status: 'unsubscribed' }).eq('id', send.target_id)
}

// ─── Health summary ───────────────────────────────────────

export interface HealthSummary {
  domains: Array<{
    domain: string
    status: string
    warmupDay: number
    sentToday: number
    bounceRate: number
    complaintRate: number
  }>
  totalSentToday: number
  totalBounceRate: number
  allHealthy: boolean
}

export async function getHealthSummary(): Promise<HealthSummary> {
  const supabase = getSupabase()

  const { data: domains } = await supabase
    .from('swarm_domains')
    .select('*')
    .order('domain')

  if (!domains || domains.length === 0) {
    return { domains: [], totalSentToday: 0, totalBounceRate: 0, allHealthy: true }
  }

  const summary = (domains as SwarmDomain[]).map(d => ({
    domain: d.domain,
    status: d.status,
    warmupDay: d.warmup_day,
    sentToday: d.sent_today,
    bounceRate: d.bounce_rate,
    complaintRate: d.complaint_rate,
  }))

  const totalSent = summary.reduce((sum, d) => sum + d.sentToday, 0)
  const totalBounced = summary.reduce((sum, d) => sum + d.sentToday * d.bounceRate, 0)
  const totalBounceRate = totalSent > 0 ? totalBounced / totalSent : 0
  const allHealthy = summary.every(d => d.status !== 'paused' && d.status !== 'suspended')

  return { domains: summary, totalSentToday: totalSent, totalBounceRate, allHealthy }
}
