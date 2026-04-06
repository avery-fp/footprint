/**
 * ENRICHER — Website email extraction
 *
 * For each swarm_target with a website but no email:
 * 1. Fetch the website HTML
 * 2. Extract email addresses from the page
 * 3. If no email found, construct common patterns (info@, hello@, contact@)
 * 4. Store the best email candidate back to swarm_targets
 */

import { getSupabase } from './lib/supabase'
import type { SwarmTarget } from './types'

// ─── Email extraction regex ───────────────────────────────

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g

// Common generic emails to deprioritize (we want owner/personal emails)
const GENERIC_PREFIXES = ['info', 'hello', 'contact', 'support', 'admin', 'sales', 'help', 'team', 'office', 'no-reply', 'noreply']

// ─── Extract domain from URL ──────────────────────────────

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ─── Fetch and extract emails from a webpage ──────────────

async function scrapeEmailsFromUrl(url: string): Promise<string[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const res = await fetch(url.startsWith('http') ? url : `https://${url}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FootprintBot/1.0)',
        'Accept': 'text/html',
      },
    })

    clearTimeout(timeout)

    if (!res.ok) return []

    const html = await res.text()

    // Extract emails from HTML (including mailto: links)
    const emails = new Set<string>()

    // Standard email pattern
    const matches = html.match(EMAIL_RE) || []
    for (const email of matches) {
      const clean = email.toLowerCase().trim()
      // Filter out obvious false positives
      if (
        clean.includes('.png') ||
        clean.includes('.jpg') ||
        clean.includes('.gif') ||
        clean.includes('.css') ||
        clean.includes('.js') ||
        clean.includes('@sentry') ||
        clean.includes('@2x') ||
        clean.includes('example.com') ||
        clean.length > 60
      ) continue

      emails.add(clean)
    }

    // Also check for mailto: links specifically
    const mailtoRe = /mailto:([\w.+-]+@[\w-]+\.[\w.]+)/gi
    let mailtoMatch
    while ((mailtoMatch = mailtoRe.exec(html)) !== null) {
      emails.add(mailtoMatch[1].toLowerCase().trim())
    }

    return Array.from(emails)
  } catch {
    return []
  }
}

// ─── Score and rank extracted emails ──────────────────────

function rankEmails(emails: string[], domain: string | null): string | null {
  if (emails.length === 0) return null

  // Prefer emails matching the business domain
  const domainEmails = domain
    ? emails.filter(e => e.endsWith(`@${domain}`))
    : emails

  const candidates = domainEmails.length > 0 ? domainEmails : emails

  // Sort: personal emails first, then generic
  const sorted = candidates.sort((a, b) => {
    const aPrefix = a.split('@')[0]
    const bPrefix = b.split('@')[0]
    const aGeneric = GENERIC_PREFIXES.some(p => aPrefix === p)
    const bGeneric = GENERIC_PREFIXES.some(p => bPrefix === p)

    if (aGeneric && !bGeneric) return 1
    if (!aGeneric && bGeneric) return -1
    return 0
  })

  return sorted[0]
}

// ─── Construct common email patterns ──────────────────────

function constructEmails(domain: string): string[] {
  return [
    `info@${domain}`,
    `hello@${domain}`,
    `contact@${domain}`,
  ]
}

// ─── Main enrichment function ─────────────────────────────

export interface EnrichOptions {
  batchSize?: number // default 50
  dryRun?: boolean
}

export interface EnrichResult {
  enriched: number
  noWebsite: number
  noEmailFound: number
  errors: string[]
}

export async function enrichTargets(opts: EnrichOptions = {}): Promise<EnrichResult> {
  const supabase = getSupabase()
  const batchSize = opts.batchSize || 50

  // Fetch targets that have a website but no email
  const { data: targets, error } = await supabase
    .from('swarm_targets')
    .select('id, name, website, category, city')
    .eq('status', 'scraped')
    .not('website', 'is', null)
    .is('email', null)
    .limit(batchSize)

  if (error) {
    return { enriched: 0, noWebsite: 0, noEmailFound: 0, errors: [`Query error: ${error.message}`] }
  }

  if (!targets || targets.length === 0) {
    console.log('  [enricher] no targets to enrich')
    return { enriched: 0, noWebsite: 0, noEmailFound: 0, errors: [] }
  }

  console.log(`  [enricher] processing ${targets.length} targets`)

  let enriched = 0
  let noEmailFound = 0
  const errors: string[] = []

  for (const target of targets) {
    const domain = extractDomain(target.website!)

    // Try scraping the website for emails
    const scrapedEmails = await scrapeEmailsFromUrl(target.website!)
    let bestEmail = rankEmails(scrapedEmails, domain)
    let emailSource: 'website_scrape' | 'constructed' = 'website_scrape'

    // If no email found via scraping, construct common patterns
    if (!bestEmail && domain) {
      const constructed = constructEmails(domain)
      bestEmail = constructed[0] // info@ as fallback
      emailSource = 'constructed'
    }

    if (opts.dryRun) {
      console.log(`  [dry] ${target.name} → ${bestEmail || 'NO EMAIL'} (${emailSource}) [${target.website}]`)
      if (bestEmail) enriched++
      else noEmailFound++
      continue
    }

    if (bestEmail) {
      const { error: updateErr } = await supabase
        .from('swarm_targets')
        .update({
          email: bestEmail,
          email_source: emailSource,
          status: 'enriched',
          enriched_at: new Date().toISOString(),
        })
        .eq('id', target.id)

      if (updateErr) {
        errors.push(`Update failed for ${target.name}: ${updateErr.message}`)
      } else {
        enriched++
      }
    } else {
      noEmailFound++
    }

    // Rate limit: 500ms between website fetches
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`  [enricher] ${enriched} enriched, ${noEmailFound} no email found, ${errors.length} errors`)

  return { enriched, noWebsite: 0, noEmailFound, errors }
}
