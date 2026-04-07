/**
 * MIRROR — LLM-powered personalized email generator
 *
 * Takes a scraped business profile → calls Claude API →
 * generates a hyper-personalized "mirror hook" email that
 * speaks the business's language and presents footprint
 * as relevant to their world.
 *
 * Each email is unique. Not template-fill. Not mail merge.
 * The LLM mirrors the target's tone, references their context,
 * and creates a genuine reason for them to look at footprint.
 */

import { getSupabase } from './lib/supabase'
import type { SwarmTarget, MirrorHookInput, MirrorHookOutput } from './types'

// ─── Claude API call ──────────────────────────────────────

async function callClaude(prompt: string, systemPrompt: string): Promise<{ text: string; model: string; tokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const model = 'claude-sonnet-4-5-20241022'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API ${res.status}: ${body}`)
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>
    model: string
    usage: { input_tokens: number; output_tokens: number }
  }

  const text = data.content.find(c => c.type === 'text')?.text || ''
  const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)

  return { text, model: data.model, tokens }
}

// ─── System prompt for mirror hook generation ─────────────
//
// IMPORTANT: A CAN-SPAM compliance footer (unsubscribe link + postal address)
// is appended to every hook AFTER this prompt runs, by appendComplianceFooter().
// The LLM must NOT generate any footer, sign-off, opt-out text, or postal
// address itself. The body proper still ends with the bare claim URL — the
// compliance footer is rendered as a separate visual block below it.

const SYSTEM_PROMPT = `You are writing a cold email to a small business. The voice is flat, indifferent, observational. You are not selling. You are noting an obvious fact about their fragmented online presence and telling them where to put it back together.

Rules:
- Subject: max 6 words. lowercase. no caps. no exclamation marks. no emoji.
- Body text: 2-4 sentences max. lowercase preferred. no marketing. no enthusiasm. no "we offer" or "you get".
- Reference their specific situation: scattered profiles, dead website, broken links, outdated info — whatever the website copy reveals.
- End with: footprint.onl/ae?claim=1 (no "visit", no "click here", no CTA framing — just the URL bare)
- NEVER mention price. NEVER use the words: free, founding, launch, promo, offer, deal, special, founder, early, exclusive, $, dollar, cost.
- NEVER use enthusiasm. No "love your work", no "amazing", no "I noticed".
- Write like someone who couldn't care less whether they sign up.
- No sign-off. No "— footprint". The URL is the ending of the body proper.
- DO NOT write any unsubscribe text, opt-out instructions, postal address, or legal footer. A separate compliance footer is appended automatically by the system. If you write one, it will be duplicated. Just stop after the URL.

Example tone:
"u have 4 profiles and a dead site. put it all here. or don't. footprint.onl/ae?claim=1"

Output format (strict — output ONLY this JSON, nothing else):
{
  "subject": "...",
  "body_text": "...",
  "body_html": "...",
  "hook_style": "mirror"
}

The body_html should be minimal: black background (#0c0c10), monospace font, the body text rendered as plain paragraphs. No buttons. No styled CTAs. The URL appears as plain text inline at the end of the body. Keep total body length under 100 words. Do not include a footer of any kind — the system will append one.`

// ─── Generate a mirror hook for one target ────────────────

export async function generateMirrorHook(input: MirrorHookInput): Promise<MirrorHookOutput> {
  const prompt = `Write a cold email for this business:

Business: ${input.business_name}
Category: ${input.category}
City: ${input.city}
Rating: ${input.rating || 'unknown'}/5 (${input.review_count} reviews)
Website copy snippet: ${input.website_copy ? `"${input.website_copy.slice(0, 500)}"` : 'not available'}

Generate the personalized email now.`

  const result = await callClaude(prompt, SYSTEM_PROMPT)

  // Parse the JSON response
  let parsed: { subject: string; body_text: string; body_html: string; hook_style: string }

  try {
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    // Fallback: generate a flat observational line
    parsed = {
      subject: `${input.business_name.toLowerCase()}`,
      body_text: `scattered profiles. dead links. put it all here. or don't.\n\nfootprint.onl/ae?claim=1`,
      body_html: buildFallbackHtml(input.business_name),
      hook_style: 'mirror',
    }
  }

  // CAN-SPAM: append the compliance footer (unsubscribe + postal address).
  // Applied to BOTH the LLM-generated path and the fallback path. Without
  // this, the email is non-compliant and cannot be lawfully sent to US
  // recipients. The footer is appended in code (not generated by the LLM)
  // so the wording is exact and the token substitution is reliable.
  const withFooter = appendComplianceFooter(
    {
      subject: parsed.subject,
      body_html: parsed.body_html || buildFallbackHtml(input.business_name),
      body_text: parsed.body_text,
    },
    input.target_token,
  )

  return {
    subject: withFooter.subject,
    body_html: withFooter.body_html,
    body_text: withFooter.body_text,
    hook_style: (parsed.hook_style as MirrorHookOutput['hook_style']) || 'mirror',
    model: result.model,
    tokens_used: result.tokens,
  }
}

// ─── CAN-SPAM compliance footer ───────────────────────────
//
// 15 U.S.C. § 7704 requires every commercial email to include:
//   (a) a clear and conspicuous opt-out mechanism that remains operational
//       for at least 30 days after the message is sent
//   (b) a valid physical postal address of the sender
//   (c) a clear identification that the message is an advertisement
//
// This helper enforces (a) and (b). The advertisement disclosure (c) is
// considered satisfied by the bare claim URL in the body — but the operator
// is responsible for confirming that interpretation under their counsel's
// guidance. This function is the *minimum* compliance surface, not a
// complete compliance program. Bounce/complaint handling and the 10-business-
// day opt-out honoring window are handled elsewhere (monitor.ts + sender.ts).
//
// Failure mode: if ARO_POSTAL_ADDRESS is unset, this function returns a
// hook with a visible placeholder string. The dry-run pipeline tolerates
// this (so the operator can audit format). The live send path in
// generateMirrorHooks() refuses to write the message if the placeholder is
// present, which fails the swarm closed.

const POSTAL_PLACEHOLDER = '[ARO_POSTAL_ADDRESS not configured]'

export function getPostalAddress(): string {
  return process.env.ARO_POSTAL_ADDRESS || POSTAL_PLACEHOLDER
}

export function isPostalConfigured(): boolean {
  return getPostalAddress() !== POSTAL_PLACEHOLDER
}

export function buildUnsubscribeUrl(targetToken: string): string {
  // Bare URL form so it renders identically in plain text and HTML and so
  // recipients can copy/paste it. The handler at /aro/u (rewrite of
  // /api/aro/unsubscribe) reads ?t= and flips swarm_targets.status to
  // 'unsubscribed'.
  return `https://footprint.onl/aro/u?t=${encodeURIComponent(targetToken)}`
}

export interface ComplianceFooterInput {
  subject: string
  body_html: string
  body_text: string
}

export function appendComplianceFooter(
  hook: ComplianceFooterInput,
  targetToken: string,
): ComplianceFooterInput {
  const unsubUrl = buildUnsubscribeUrl(targetToken)
  const postal = getPostalAddress()

  // Plain text footer — separated from the body by a blank line and a
  // visual divider so it reads as a distinct legal artifact, not part of
  // the prose.
  const footerText = [
    '',
    '',
    '---',
    `to opt out: ${unsubUrl}`,
    postal,
  ].join('\n')

  // HTML footer — smaller, dimmer, top-bordered. Matches the dark/monospace
  // aesthetic of the body but is visually subordinate.
  const footerHtml = `
  <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #1a1a20; max-width: 540px; margin-left: auto; margin-right: auto; padding-left: 32px; padding-right: 32px; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; line-height: 1.7; font-weight: 300; color: #555560;">
    <p style="margin: 0 0 8px 0;">to opt out: <a href="${escapeHtmlAttr(unsubUrl)}" style="color: #555560; text-decoration: underline;">${escapeHtmlText(unsubUrl)}</a></p>
    <p style="margin: 0;">${escapeHtmlText(postal)}</p>
  </div>`

  // Append HTML footer just before the closing body tag, or at the end if
  // there isn't one. The fallback HTML template wraps everything in a
  // single outer <div>, so we close that div, append the footer, and let
  // the email client render them stacked.
  let bodyHtml = hook.body_html
  // If the HTML ends with a closing </div>, inject the footer before it
  // so the footer is inside the outer container (consistent background).
  const lastClosingDiv = bodyHtml.lastIndexOf('</div>')
  if (lastClosingDiv !== -1) {
    bodyHtml = bodyHtml.slice(0, lastClosingDiv) + footerHtml + bodyHtml.slice(lastClosingDiv)
  } else {
    bodyHtml = bodyHtml + footerHtml
  }

  return {
    subject: hook.subject,
    body_html: bodyHtml,
    body_text: hook.body_text + footerText,
  }
}

function escapeHtmlText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}

function escapeHtmlAttr(s: string): string {
  return escapeHtmlText(s)
}

// ─── Fallback HTML template ───────────────────────────────

function buildFallbackHtml(businessName: string): string {
  const safeName = businessName.toLowerCase().replace(/[<>&"']/g, '')
  return `<div style="background-color: #0c0c10; width: 100%; min-height: 100%; margin: 0; padding: 0;">
  <div style="max-width: 540px; margin: 0 auto; padding: 64px 32px;">
    <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 14px; line-height: 1.7; font-weight: 300; color: #888892;">
      ${safeName}. scattered profiles. dead links.<br>
      put it all here. or don't.
    </p>
    <p style="margin: 32px 0 0 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 14px; line-height: 1.7; font-weight: 300; color: #d4c5a9;">
      footprint.onl/ae?claim=1
    </p>
  </div>
</div>`
}

// ─── Fetch website copy snippet for context ───────────────

async function fetchWebsiteCopy(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url.startsWith('http') ? url : `https://${url}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FootprintBot/1.0)',
        'Accept': 'text/html',
      },
    })

    clearTimeout(timeout)
    if (!res.ok) return null

    const html = await res.text()

    // Strip HTML tags, get text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Return first 500 chars of meaningful text
    return text.slice(0, 500) || null
  } catch {
    return null
  }
}

// ─── Batch mirror hook generation ─────────────────────────

export interface MirrorOptions {
  batchSize?: number // default 20
  dryRun?: boolean
}

export interface MirrorResult {
  generated: number
  errors: string[]
  tokensUsed: number
}

export async function generateMirrorHooks(opts: MirrorOptions = {}): Promise<MirrorResult> {
  // FAIL CLOSED on missing postal address in live mode. Sending a non-compliant
  // commercial email to a US recipient is a CAN-SPAM violation. Better to crash
  // the swarm here than to silently send placeholder-footer mail to real targets.
  if (!opts.dryRun && !isPostalConfigured()) {
    return {
      generated: 0,
      errors: [
        'ARO_POSTAL_ADDRESS env var is not set. CAN-SPAM compliance requires a ' +
        'valid physical postal address in every commercial email. Refusing to ' +
        'generate hooks in live mode without it. Set ARO_POSTAL_ADDRESS in .env ' +
        'and re-run, or use --dry-run for format auditing.',
      ],
      tokensUsed: 0,
    }
  }

  const supabase = getSupabase()
  const batchSize = opts.batchSize || 20

  // Fetch enriched targets that don't have a message yet
  const { data: targets, error } = await supabase
    .from('swarm_targets')
    .select('id, name, category, city, website, email, rating, review_count')
    .eq('status', 'enriched')
    .not('email', 'is', null)
    .limit(batchSize)

  if (error) {
    return { generated: 0, errors: [`Query error: ${error.message}`], tokensUsed: 0 }
  }

  if (!targets || targets.length === 0) {
    console.log('  [mirror] no targets to generate hooks for')
    return { generated: 0, errors: [], tokensUsed: 0 }
  }

  console.log(`  [mirror] generating hooks for ${targets.length} targets`)

  let generated = 0
  let totalTokens = 0
  const errors: string[] = []

  for (const target of targets) {
    try {
      // Fetch website copy for context (if available)
      const websiteCopy = target.website ? await fetchWebsiteCopy(target.website) : null

      const input: MirrorHookInput = {
        business_name: target.name,
        category: target.category,
        city: target.city,
        website_copy: websiteCopy,
        rating: target.rating,
        review_count: target.review_count,
        target_token: target.id,
      }

      if (opts.dryRun) {
        console.log(`  [dry] would generate hook for: ${target.name} (${target.category}, ${target.city})`)
        generated++
        continue
      }

      const hook = await generateMirrorHook(input)
      totalTokens += hook.tokens_used

      // Store the message
      const { error: insertErr } = await supabase
        .from('swarm_messages')
        .upsert({
          target_id: target.id,
          subject: hook.subject,
          body_html: hook.body_html,
          body_text: hook.body_text,
          hook_style: hook.hook_style,
          model: hook.model,
          tokens_used: hook.tokens_used,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'target_id' })

      if (insertErr) {
        errors.push(`Insert failed for ${target.name}: ${insertErr.message}`)
        continue
      }

      // Update target status
      await supabase
        .from('swarm_targets')
        .update({ status: 'messaged' })
        .eq('id', target.id)

      generated++
      console.log(`  [mirror] ${target.name}: "${hook.subject}"`)

      // Rate limit: Claude API ~60 RPM
      await new Promise(r => setTimeout(r, 1100))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${target.name}: ${msg}`)
    }
  }

  console.log(`  [mirror] ${generated} hooks generated, ${totalTokens} tokens used, ${errors.length} errors`)

  return { generated, errors, tokensUsed: totalTokens }
}
