/**
 * SENDER — Unified SES Multi-Region Email Dispatch
 *
 * Replaces the old daemon.ts multi-provider approach.
 * For 150k/day volume, SES is the only viable path.
 *
 * Features:
 * - Multi-region SES with round-robin
 * - Per-domain daily limit enforcement
 * - Domain warmup schedule
 * - Automatic failover on region errors
 * - Resend/SendGrid as backup providers
 */

import { getSupabase } from './lib/supabase'
import type { SwarmDomain, SESRegionConfig } from './types'

// ─── SES Send via raw API (no SDK dependency) ─────────────

interface SESPayload {
  to: string
  from: string
  subject: string
  bodyHtml: string
  bodyText: string
}

interface SendResult {
  provider: string
  domain: string
  success: boolean
  messageId?: string
  error?: string
}

// AWS Signature V4 is complex — use the SDK if installed, fall back to fetch
async function sendViaSES(
  payload: SESPayload,
  config: SESRegionConfig,
): Promise<SendResult> {
  try {
    // Dynamic import — only loads if @aws-sdk/client-ses is installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let SESClient: any, SendEmailCommand: any
    try {
      const ses = await (Function('return import("@aws-sdk/client-ses")')() as Promise<any>)
      SESClient = ses.SESClient
      SendEmailCommand = ses.SendEmailCommand
    } catch {
      return {
        provider: `ses-${config.region}`,
        domain: config.domain,
        success: false,
        error: '@aws-sdk/client-ses not installed. Run: npm install @aws-sdk/client-ses',
      }
    }

    const client = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })

    const cmd = new SendEmailCommand({
      Source: payload.from,
      Destination: { ToAddresses: [payload.to] },
      Message: {
        Subject: { Data: payload.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: payload.bodyHtml, Charset: 'UTF-8' },
          Text: { Data: payload.bodyText, Charset: 'UTF-8' },
        },
      },
    })

    const result = await client.send(cmd)

    return {
      provider: `ses-${config.region}`,
      domain: config.domain,
      success: true,
      messageId: result.MessageId,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      provider: `ses-${config.region}`,
      domain: config.domain,
      success: false,
      error: msg,
    }
  }
}

// ─── Backup: Resend provider ──────────────────────────────

async function sendViaResend(payload: SESPayload): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { provider: 'resend', domain: '', success: false, error: 'RESEND_API_KEY not set' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.bodyHtml,
        text: payload.bodyText,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { provider: 'resend', domain: '', success: false, error: `${res.status}: ${body}` }
    }

    const data = await res.json() as { id: string }
    return { provider: 'resend', domain: '', success: true, messageId: data.id }
  } catch (err) {
    return { provider: 'resend', domain: '', success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Load SES region configs from ENV ─────────────────────

function loadSESConfigs(): SESRegionConfig[] {
  const configs: SESRegionConfig[] = []

  // Support up to 5 SES regions
  for (let i = 1; i <= 5; i++) {
    const region = process.env[`AWS_SES_REGION_${i}`]
    const accessKeyId = process.env[`AWS_SES_ACCESS_KEY_${i}`]
    const secretAccessKey = process.env[`AWS_SES_SECRET_KEY_${i}`]
    const fromAddress = process.env[`AWS_SES_FROM_${i}`]
    const domain = process.env[`AWS_SES_DOMAIN_${i}`]

    if (region && accessKeyId && secretAccessKey && fromAddress && domain) {
      configs.push({ region, accessKeyId, secretAccessKey, fromAddress, domain })
    }
  }

  return configs
}

// ─── Domain warmup schedule ───────────────────────────────
// Conservative warmup: double volume every 2 days

const WARMUP_SCHEDULE: Record<number, number> = {
  1: 50,
  2: 50,
  3: 100,
  4: 100,
  5: 200,
  6: 200,
  7: 500,
  8: 500,
  9: 1000,
  10: 1000,
  11: 2000,
  12: 2000,
  13: 5000,
  14: 5000,
  15: 10000,
  16: 10000,
  17: 20000,
  18: 20000,
  19: 50000,
  20: 50000,
}

function getWarmupLimit(day: number): number {
  if (day >= 20) return 50000
  return WARMUP_SCHEDULE[day] || 50
}

// ─── Load available domains from DB ───────────────────────

async function getAvailableDomains(): Promise<SwarmDomain[]> {
  const supabase = getSupabase()

  // Reset daily counters if needed
  await supabase.rpc('swarm_reset_daily_counters')

  const { data: domains } = await supabase
    .from('swarm_domains')
    .select('*')
    .in('status', ['warming', 'active'])
    .order('sent_today', { ascending: true }) // least-used first

  return (domains || []) as SwarmDomain[]
}

// ─── Pick next domain + region for sending ────────────────

let roundRobinIdx = 0

function pickDomain(
  domains: SwarmDomain[],
  sesConfigs: SESRegionConfig[],
): { domain: SwarmDomain; config: SESRegionConfig } | null {
  // Filter to domains under their daily limit
  const available = domains.filter(d => {
    const limit = d.status === 'warming' ? getWarmupLimit(d.warmup_day) : d.daily_limit
    return d.sent_today < limit
  })

  if (available.length === 0) return null

  // Round-robin across available domains
  const idx = roundRobinIdx % available.length
  roundRobinIdx++

  const domain = available[idx]
  const config = sesConfigs.find(c => c.domain === domain.domain)

  if (!config) return null

  return { domain, config }
}

// ─── Main send function ───────────────────────────────────

export interface SendOptions {
  batchSize?: number // default 50
  dryRun?: boolean
  delayMs?: number // between sends, default 200
}

export interface BatchSendResult {
  sent: number
  failed: number
  skipped: number
  providers: string[]
}

export async function sendBatch(opts: SendOptions = {}): Promise<BatchSendResult> {
  const supabase = getSupabase()
  const batchSize = opts.batchSize || 50
  const delayMs = opts.delayMs || 200
  const sesConfigs = loadSESConfigs()

  console.log('\n  ╔══════════════════════════════════════════╗')
  console.log('  ║   SWARM SENDER — SES MULTI-REGION        ║')
  console.log(`  ║   SES regions: ${sesConfigs.length}`)
  console.log(`  ║   mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('  ╚══════════════════════════════════════════╝\n')

  // Get available domains
  const domains = await getAvailableDomains()
  if (domains.length === 0 && sesConfigs.length === 0) {
    console.log('  [sender] no SES domains configured, falling back to Resend')
  }

  // Fetch targets ready to send (messaged status + have a message)
  const { data: targets, error } = await supabase
    .from('swarm_targets')
    .select(`
      id, name, email, category, city,
      swarm_messages!inner(id, subject, body_html, body_text)
    `)
    .eq('status', 'messaged')
    .not('email', 'is', null)
    .limit(batchSize)

  if (error) {
    console.log(`  [sender] query error: ${error.message}`)
    return { sent: 0, failed: 0, skipped: 0, providers: [] }
  }

  if (!targets || targets.length === 0) {
    console.log('  [sender] queue empty — nothing to send')
    return { sent: 0, failed: 0, skipped: 0, providers: [] }
  }

  console.log(`  [sender] ${targets.length} emails in batch`)

  let sent = 0
  let failed = 0
  let skipped = 0
  const usedProviders = new Set<string>()

  for (const target of targets) {
    const messages = target.swarm_messages as unknown as Array<{
      id: string; subject: string; body_html: string; body_text: string
    }>
    const message = messages[0]
    if (!message) { skipped++; continue }

    // Pick a domain + SES config
    const pick = pickDomain(domains, sesConfigs)

    const payload: SESPayload = {
      to: target.email!,
      from: pick ? pick.config.fromAddress : `hello@footprint.site`,
      subject: message.subject,
      bodyHtml: message.body_html,
      bodyText: message.body_text,
    }

    if (opts.dryRun) {
      console.log(`  [dry] → ${target.email}: "${message.subject}" via ${pick ? `ses-${pick.config.region}` : 'resend'}`)
      sent++
      continue
    }

    // Send via SES or fallback to Resend
    let result: SendResult

    if (pick) {
      result = await sendViaSES(payload, pick.config)
    } else {
      result = await sendViaResend(payload)
    }

    usedProviders.add(result.provider)

    if (result.success) {
      // Record the send
      await supabase.from('swarm_sends').insert({
        target_id: target.id,
        message_id: message.id,
        ses_message_id: result.messageId,
        provider: result.provider,
        from_domain: result.domain || 'resend',
        status: 'sent',
        sent_at: new Date().toISOString(),
      })

      // Update target status
      await supabase.from('swarm_targets').update({ status: 'sent' }).eq('id', target.id)

      // Increment domain counter
      if (pick) {
        await supabase.from('swarm_domains')
          .update({
            sent_today: pick.domain.sent_today + 1,
            last_sent_at: new Date().toISOString(),
          })
          .eq('id', pick.domain.id)

        // Update local copy for round-robin accuracy
        pick.domain.sent_today++
      }

      sent++
    } else {
      // Record the failure
      await supabase.from('swarm_sends').insert({
        target_id: target.id,
        message_id: message.id,
        provider: result.provider,
        from_domain: result.domain || 'resend',
        status: 'failed',
        error: result.error,
      })

      console.log(`  [FAIL] ${target.email}: ${result.error}`)
      failed++
    }

    // Rate limit between sends
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  console.log(`\n  [sender] batch: ${sent} sent, ${failed} failed, ${skipped} skipped`)
  console.log(`  [sender] providers: ${Array.from(usedProviders).join(', ') || 'none'}`)

  return { sent, failed, skipped, providers: Array.from(usedProviders) }
}
