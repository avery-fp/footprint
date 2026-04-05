/**
 * ARO Daemon — Multi-Provider Email Dispatch Engine
 *
 * The "Gatling Gun": round-robin email distribution across
 * Resend, SendGrid, and Mailgun with automatic failover.
 *
 * Provider availability is determined by ENV keys:
 *   RESEND_API_KEY   → Resend
 *   SENDGRID_API_KEY → SendGrid
 *   MAILGUN_API_KEY  → Mailgun (+ MAILGUN_DOMAIN)
 *
 * If only one key exists, 100% routes there.
 * If all three exist, load splits ~33/33/33 round-robin.
 * On failure, the next provider in the rotation retries immediately.
 */

import { getSupabase } from './lib/supabase'

// ─── Provider interface ──────────────────────────────────────

interface EmailPayload {
  to: string
  from: string
  subject: string
  text: string
}

interface SendResult {
  provider: string
  success: boolean
  messageId?: string
  error?: string
}

interface EmailProvider {
  name: string
  send: (payload: EmailPayload) => Promise<SendResult>
}

// ─── Provider implementations (raw fetch, no heavy SDKs) ────

function makeResendProvider(apiKey: string): EmailProvider {
  return {
    name: 'resend',
    async send(payload) {
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
          text: payload.text,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        return { provider: 'resend', success: false, error: `${res.status}: ${body}` }
      }

      const data = await res.json() as { id: string }
      return { provider: 'resend', success: true, messageId: data.id }
    },
  }
}

function makeSendGridProvider(apiKey: string): EmailProvider {
  return {
    name: 'sendgrid',
    async send(payload) {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: payload.from },
          subject: payload.subject,
          content: [{ type: 'text/plain', value: payload.text }],
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        return { provider: 'sendgrid', success: false, error: `${res.status}: ${body}` }
      }

      const messageId = res.headers.get('x-message-id') || 'ok'
      return { provider: 'sendgrid', success: true, messageId }
    },
  }
}

function makeMailgunProvider(apiKey: string, domain: string): EmailProvider {
  return {
    name: 'mailgun',
    async send(payload) {
      const form = new URLSearchParams()
      form.set('from', payload.from)
      form.set('to', payload.to)
      form.set('subject', payload.subject)
      form.set('text', payload.text)

      const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${apiKey}`)}`,
        },
        body: form,
      })

      if (!res.ok) {
        const body = await res.text()
        return { provider: 'mailgun', success: false, error: `${res.status}: ${body}` }
      }

      const data = await res.json() as { id: string }
      return { provider: 'mailgun', success: true, messageId: data.id }
    },
  }
}

// ─── Build provider pool from ENV ────────────────────────────

function buildProviderPool(): EmailProvider[] {
  const providers: EmailProvider[] = []

  if (process.env.RESEND_API_KEY) {
    providers.push(makeResendProvider(process.env.RESEND_API_KEY))
  }
  if (process.env.SENDGRID_API_KEY) {
    providers.push(makeSendGridProvider(process.env.SENDGRID_API_KEY))
  }
  if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
    providers.push(makeMailgunProvider(process.env.MAILGUN_API_KEY, process.env.MAILGUN_DOMAIN))
  }

  return providers
}

// ─── Round-robin dispatcher ──────────────────────────────────

let roundRobinIndex = 0

/**
 * Dispatch a single email with round-robin + failover.
 * Tries each provider in rotation order. If the primary fails,
 * immediately retries with the next provider(s) in the pool.
 */
export async function dispatchEmail(
  payload: EmailPayload,
  providers: EmailProvider[],
): Promise<SendResult> {
  if (providers.length === 0) {
    return { provider: 'none', success: false, error: 'No email providers configured' }
  }

  const startIdx = roundRobinIndex % providers.length
  roundRobinIndex++

  // Try each provider starting from the round-robin position
  for (let attempt = 0; attempt < providers.length; attempt++) {
    const idx = (startIdx + attempt) % providers.length
    const provider = providers[idx]

    try {
      const result = await provider.send(payload)

      if (result.success) {
        return result
      }

      // Provider returned an error — log and try next
      console.log(`  [daemon] ${provider.name} failed: ${result.error}`)
    } catch (err) {
      // Network error, timeout, etc — log and try next
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  [daemon] ${provider.name} threw: ${msg}`)
    }
  }

  return {
    provider: 'all',
    success: false,
    error: `All ${providers.length} providers failed for ${payload.to}`,
  }
}

// ─── Daemon: process the queue ───────────────────────────────

export interface DaemonResult {
  sent: number
  failed: number
  skipped: number
  providers: string[]
}

export async function runDaemon(opts: {
  batchSize?: number
  fromAddress?: string
  subject?: string
  dryRun?: boolean
} = {}): Promise<DaemonResult> {
  const {
    batchSize = 50,
    fromAddress = 'aro@footprint.site',
    subject = 'footprint.site',
    dryRun = false,
  } = opts

  const providers = buildProviderPool()

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   ARO DAEMON — GATLING GUN               ║')
  console.log(`║   providers: ${providers.map(p => p.name).join(', ') || 'NONE'}`)
  console.log(`║   mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('╚══════════════════════════════════════════╝\n')

  if (providers.length === 0) {
    console.log('  [daemon] NO PROVIDERS — set RESEND_API_KEY, SENDGRID_API_KEY, or MAILGUN_API_KEY + MAILGUN_DOMAIN')
    return { sent: 0, failed: 0, skipped: 0, providers: [] }
  }

  const supabase = getSupabase()
  const now = new Date().toISOString()

  // Fetch due messages that haven't been sent yet
  const { data: messages, error } = await supabase
    .from('aro_messages')
    .select('id, target_id, body, channel, serial_number, targets(username, platform)')
    .eq('channel', 'email')
    .lte('scheduled_at', now)
    .is('sent_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    console.log(`  [daemon] query error: ${error.message}`)
    return { sent: 0, failed: 0, skipped: 0, providers: providers.map(p => p.name) }
  }

  if (!messages || messages.length === 0) {
    console.log('  [daemon] queue empty — nothing to send')
    return { sent: 0, failed: 0, skipped: 0, providers: providers.map(p => p.name) }
  }

  console.log(`  [daemon] ${messages.length} messages in batch`)

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const msg of messages) {
    const target = msg.targets as unknown as { username: string; platform: string } | null

    // We need an email address for the target — for now, skip non-email-resolvable targets
    // In production, targets table would have an email column
    if (!target?.username) {
      skipped++
      continue
    }

    const payload: EmailPayload = {
      to: target.username, // assume username is email for email channel targets
      from: fromAddress,
      subject,
      text: msg.body,
    }

    if (dryRun) {
      console.log(`  [dry] → ${payload.to}: "${msg.body}" (would use ${providers[roundRobinIndex % providers.length].name})`)
      roundRobinIndex++
      sent++
      continue
    }

    const result = await dispatchEmail(payload, providers)

    if (result.success) {
      // Mark as sent + log event
      await supabase
        .from('aro_messages')
        .update({ sent_at: new Date().toISOString(), sent_provider: result.provider })
        .eq('id', msg.id)

      await supabase.from('aro_events').insert({
        target_id: msg.target_id,
        message_id: msg.id,
        channel: 'email',
        event_type: 'sent',
        meta: { provider: result.provider, message_id: result.messageId },
        occurred_at: new Date().toISOString(),
      })

      console.log(`  [sent] #${msg.serial_number} → ${payload.to} via ${result.provider}`)
      sent++
    } else {
      console.log(`  [FAIL] #${msg.serial_number} → ${payload.to}: ${result.error}`)
      failed++
    }
  }

  console.log(`\n  [daemon] batch complete: ${sent} sent, ${failed} failed, ${skipped} skipped`)

  if (sent > 0 || dryRun) {
    console.log('\n  GATLING GUN ARMED. INFINITE VOLUME UNLOCKED.')
  }

  return { sent, failed, skipped, providers: providers.map(p => p.name) }
}
