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

const SYSTEM_PROMPT = `You are a cold email copywriter for footprint.onl — a $10 digital portfolio/personal page builder. Your job is to write a short, personalized outreach email to a local business.

Rules:
- Subject line: max 8 words, no spam triggers, no caps lock, no exclamation marks
- Body: 3-5 sentences max. Plain text, no HTML formatting in the text version.
- Mirror the business's world — reference their specific category, location, or what they do
- Present footprint as a tool that solves a real problem for them (online presence, link-in-bio, portfolio)
- NO fake familiarity ("I love your work!"), NO cringe, NO corporate speak
- Include a single CTA: "footprint.onl"
- Sign off simply: "— footprint"
- Tone: direct, minimal, confident. Like a text from someone who gets it.

Output format (strict — output ONLY this JSON, nothing else):
{
  "subject": "...",
  "body_text": "...",
  "body_html": "...",
  "hook_style": "mirror"
}

The body_html should be a minimal styled email with dark background (#0c0c10), monospace font, and a single CTA button linking to footprint.onl. Keep it under 200 words total.`

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
    // Fallback: generate a basic response
    parsed = {
      subject: `${input.business_name}, one page for everything`,
      body_text: `${input.business_name} — your whole online presence, one clean page. $10, yours forever. footprint.onl\n\n— footprint`,
      body_html: buildFallbackHtml(input.business_name),
      hook_style: 'direct',
    }
  }

  return {
    subject: parsed.subject,
    body_html: parsed.body_html || buildFallbackHtml(input.business_name),
    body_text: parsed.body_text,
    hook_style: (parsed.hook_style as MirrorHookOutput['hook_style']) || 'mirror',
    model: result.model,
    tokens_used: result.tokens,
  }
}

// ─── Fallback HTML template ───────────────────────────────

function buildFallbackHtml(businessName: string): string {
  return `<div style="background-color: #0c0c10; width: 100%; min-height: 100%; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 72px 32px 60px 32px; text-align: center;">
    <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.6; font-weight: 300; color: #555560; letter-spacing: 0.04em; text-transform: lowercase;">${businessName}</p>
    <p style="margin: 40px 0 0 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 18px; line-height: 1.55; font-weight: 300; color: #d4c5a9; letter-spacing: 0.01em;">your whole online presence.<br>one clean page. $10.</p>
    <div style="margin: 48px 0 0 0;">
      <a href="https://www.footprint.onl" style="display: inline-block; padding: 14px 36px; background-color: #d4c5a9; color: #0c0c10; font-family: 'DM Mono', 'Courier New', monospace; font-size: 14px; font-weight: 500; text-decoration: none; letter-spacing: 0.04em; border-radius: 3px;">see footprint</a>
    </div>
    <div style="margin: 80px 0 0 0; border-top: 1px solid #1e1e24; padding-top: 24px;">
      <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 12px; color: #555560;">— footprint</p>
    </div>
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
