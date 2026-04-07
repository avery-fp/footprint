/**
 * Tests for the swarm hardening changes:
 *   1. CAN-SPAM compliance footer (appendComplianceFooter, buildUnsubscribeUrl)
 *   2. Postal address configuration gate (getPostalAddress, isPostalConfigured)
 *   3. --limit enforcement (deriveEffectiveBatches)
 *   4. Mock pipeline target shape (MOCK_TARGETS)
 *
 * These are pure-function tests. The Claude-calling and Supabase-touching
 * paths are not unit-tested here — those are integration concerns covered by
 * the dry-run mock pipeline (manually) and the live verification workflow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  appendComplianceFooter,
  buildUnsubscribeUrl,
  getPostalAddress,
  isPostalConfigured,
} from '@/src/aro/mirror'
import { deriveEffectiveBatches, MOCK_TARGETS } from '@/src/aro/swarm'
import type { MirrorHookInput } from '@/src/aro/types'

// ─── CAN-SPAM compliance footer ───────────────────────────

describe('appendComplianceFooter', () => {
  const exampleHook = {
    subject: 'scattered',
    body_text: 'u have 4 profiles and a dead site. put it all here. or don\'t. footprint.onl/ae?claim=1',
    body_html: '<div style="background: #0c0c10;"><p>scattered profiles. dead links.</p><p>footprint.onl/ae?claim=1</p></div>',
  }
  const token = '00000000-0000-4000-8000-000000000001'

  beforeEach(() => {
    // Set a postal address so the footer doesn't render the placeholder
    process.env.ARO_POSTAL_ADDRESS = '123 Test St, Brooklyn NY 11201'
  })

  afterEach(() => {
    delete process.env.ARO_POSTAL_ADDRESS
  })

  it('appends an unsubscribe URL containing the target token', () => {
    const result = appendComplianceFooter(exampleHook, token)
    expect(result.body_text).toContain('to opt out:')
    expect(result.body_text).toContain(token)
    expect(result.body_text).toContain('footprint.onl/aro/u?t=')
  })

  it('appends the postal address from env', () => {
    const result = appendComplianceFooter(exampleHook, token)
    expect(result.body_text).toContain('123 Test St, Brooklyn NY 11201')
  })

  it('preserves the original body content', () => {
    const result = appendComplianceFooter(exampleHook, token)
    // The body proper (everything before the footer divider) must remain
    // intact — the footer is appended, not substituted.
    expect(result.body_text).toContain('u have 4 profiles and a dead site')
    expect(result.body_text).toContain('footprint.onl/ae?claim=1')
  })

  it('preserves the subject unchanged', () => {
    const result = appendComplianceFooter(exampleHook, token)
    expect(result.subject).toBe(exampleHook.subject)
  })

  it('appends the footer to body_html as well', () => {
    const result = appendComplianceFooter(exampleHook, token)
    expect(result.body_html).toContain('to opt out:')
    expect(result.body_html).toContain('123 Test St')
    expect(result.body_html).toContain(token)
  })

  it('escapes html in the postal address', () => {
    process.env.ARO_POSTAL_ADDRESS = '<script>alert(1)</script> 123 Main St'
    const result = appendComplianceFooter(exampleHook, token)
    expect(result.body_html).not.toContain('<script>alert(1)</script>')
    expect(result.body_html).toContain('&lt;script&gt;')
  })

  it('renders the unsubscribe URL with the token URL-encoded', () => {
    const weirdToken = '00000000-0000-4000-8000-000000000abc'
    const result = appendComplianceFooter(exampleHook, weirdToken)
    expect(result.body_text).toContain(`footprint.onl/aro/u?t=${weirdToken}`)
  })

  it('injects the html footer inside the outer container if present', () => {
    const wrapped = {
      subject: 's',
      body_text: 'b',
      body_html: '<div style="background: black;"><p>body</p></div>',
    }
    const result = appendComplianceFooter(wrapped, token)
    // Footer should be inside the outer div, before its closing tag
    const lastClosingDiv = result.body_html.lastIndexOf('</div>')
    const footerStart = result.body_html.indexOf('to opt out:')
    expect(footerStart).toBeGreaterThan(-1)
    expect(footerStart).toBeLessThan(lastClosingDiv)
  })

  it('falls back to appending after the body if no closing div is found', () => {
    const plain = {
      subject: 's',
      body_text: 'b',
      body_html: '<p>body</p>',
    }
    const result = appendComplianceFooter(plain, token)
    expect(result.body_html).toContain('<p>body</p>')
    expect(result.body_html.indexOf('to opt out:')).toBeGreaterThan(
      result.body_html.indexOf('<p>body</p>'),
    )
  })
})

describe('buildUnsubscribeUrl', () => {
  it('builds a https URL with the token in ?t=', () => {
    const url = buildUnsubscribeUrl('abc-123')
    expect(url).toBe('https://footprint.onl/aro/u?t=abc-123')
  })

  it('url-encodes special characters in the token', () => {
    const url = buildUnsubscribeUrl('abc 123 / & = ?')
    // None of these should appear unencoded
    expect(url).not.toContain('abc 123')
    expect(url).toContain('abc%20123')
  })
})

// ─── Postal address configuration gate ────────────────────

describe('postal address gate', () => {
  afterEach(() => {
    delete process.env.ARO_POSTAL_ADDRESS
  })

  it('isPostalConfigured returns false when env var is unset', () => {
    delete process.env.ARO_POSTAL_ADDRESS
    expect(isPostalConfigured()).toBe(false)
  })

  it('isPostalConfigured returns true when env var is set', () => {
    process.env.ARO_POSTAL_ADDRESS = '123 Main St, City, ST 12345'
    expect(isPostalConfigured()).toBe(true)
  })

  it('getPostalAddress returns a placeholder when unset', () => {
    delete process.env.ARO_POSTAL_ADDRESS
    expect(getPostalAddress()).toContain('not configured')
  })

  it('getPostalAddress returns the env value when set', () => {
    process.env.ARO_POSTAL_ADDRESS = '999 Oak Ave'
    expect(getPostalAddress()).toBe('999 Oak Ave')
  })

  it('the placeholder is visibly distinct so it shows up in dry-run output', () => {
    delete process.env.ARO_POSTAL_ADDRESS
    const placeholder = getPostalAddress()
    expect(placeholder).toContain('[')
    expect(placeholder).toContain(']')
  })
})

// ─── --limit enforcement ──────────────────────────────────

describe('deriveEffectiveBatches', () => {
  it('returns defaults when limit is not set', () => {
    const batches = deriveEffectiveBatches({})
    expect(batches.scrapeBatchSize).toBe(3)
    expect(batches.maxPerTarget).toBe(60)
    expect(batches.enrichBatchSize).toBe(50)
    expect(batches.mirrorBatchSize).toBe(20)
    expect(batches.sendBatchSize).toBe(50)
  })

  it('caps every stage when limit is small', () => {
    const batches = deriveEffectiveBatches({ limit: 10 })
    // scraper is special: pairs forced to 1, maxPerTarget capped at limit
    expect(batches.scrapeBatchSize).toBe(1)
    expect(batches.maxPerTarget).toBe(10)
    // others capped at min(default, limit)
    expect(batches.enrichBatchSize).toBe(10)
    expect(batches.mirrorBatchSize).toBe(10)
    expect(batches.sendBatchSize).toBe(10)
  })

  it('caps every stage at exactly limit=1', () => {
    const batches = deriveEffectiveBatches({ limit: 1 })
    expect(batches.scrapeBatchSize).toBe(1)
    expect(batches.maxPerTarget).toBe(1)
    expect(batches.enrichBatchSize).toBe(1)
    expect(batches.mirrorBatchSize).toBe(1)
    expect(batches.sendBatchSize).toBe(1)
  })

  it('does not increase a batch size that is already smaller than limit', () => {
    const batches = deriveEffectiveBatches({
      limit: 1000,
      enrichBatchSize: 5,
      mirrorBatchSize: 5,
    })
    // limit > configured: configured wins
    expect(batches.enrichBatchSize).toBe(5)
    expect(batches.mirrorBatchSize).toBe(5)
    // unspecified stages still use limit-capped defaults
    expect(batches.sendBatchSize).toBe(50)
  })

  it('the foot-gun is fixed: --once --limit 10 cannot exceed 10 in any stage', () => {
    // Re-create the exact scenario from the verification report:
    // previously --once --limit 10 ran scrape=180, enrich=50, mirror=20, send=50.
    const batches = deriveEffectiveBatches({ limit: 10, once: true })
    // Total scrape volume = pairs × maxPerTarget. Both must be small.
    expect(batches.scrapeBatchSize * batches.maxPerTarget).toBeLessThanOrEqual(10)
    expect(batches.enrichBatchSize).toBeLessThanOrEqual(10)
    expect(batches.mirrorBatchSize).toBeLessThanOrEqual(10)
    expect(batches.sendBatchSize).toBeLessThanOrEqual(10)
  })

  it('a limit of 0 caps everything to 0 (effectively a no-op cycle)', () => {
    const batches = deriveEffectiveBatches({ limit: 0 })
    expect(batches.maxPerTarget).toBe(0)
    expect(batches.enrichBatchSize).toBe(0)
    expect(batches.mirrorBatchSize).toBe(0)
    expect(batches.sendBatchSize).toBe(0)
  })
})

// ─── Mock pipeline target shape ───────────────────────────

describe('MOCK_TARGETS', () => {
  it('contains exactly 10 mock businesses', () => {
    expect(MOCK_TARGETS).toHaveLength(10)
  })

  it('every mock has a uuid-shaped target_token', () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const mock of MOCK_TARGETS) {
      expect(mock.target_token).toMatch(uuidRe)
    }
  })

  it('every mock has the synthetic test prefix to avoid colliding with real swarm_targets ids', () => {
    for (const mock of MOCK_TARGETS) {
      expect(mock.target_token.startsWith('00000000-0000-4000-8000-')).toBe(true)
    }
  })

  it('mocks cover diverse categories so the tone audit exercises multiple business types', () => {
    const categories = new Set(MOCK_TARGETS.map((m) => m.category))
    // At least 6 distinct categories so the audit isn't dominated by one type
    expect(categories.size).toBeGreaterThanOrEqual(6)
  })

  it('includes both businesses with website_copy and without (null) to exercise the fallback', () => {
    const withCopy = MOCK_TARGETS.filter((m) => m.website_copy !== null)
    const withoutCopy = MOCK_TARGETS.filter((m) => m.website_copy === null)
    expect(withCopy.length).toBeGreaterThan(0)
    expect(withoutCopy.length).toBeGreaterThan(0)
  })

  it('every mock can be used as a MirrorHookInput', () => {
    // Type-level check: assignable to MirrorHookInput
    const inputs: MirrorHookInput[] = MOCK_TARGETS
    expect(inputs.length).toBe(10)
  })
})

// ─── Unsubscribe handler URL pattern ──────────────────────

describe('unsubscribe URL routing', () => {
  it('every appended footer URL routes to the same /aro/u path', () => {
    const tokens = MOCK_TARGETS.map((m) => m.target_token)
    process.env.ARO_POSTAL_ADDRESS = 'test address'
    try {
      for (const token of tokens) {
        const url = buildUnsubscribeUrl(token)
        expect(url).toMatch(/^https:\/\/footprint\.onl\/aro\/u\?t=/)
        expect(url).toContain(token)
      }
    } finally {
      delete process.env.ARO_POSTAL_ADDRESS
    }
  })

  it('the URL pattern matches what the next.config.js rewrite expects', () => {
    const url = new URL(buildUnsubscribeUrl('test-token'))
    expect(url.pathname).toBe('/aro/u')
    expect(url.searchParams.get('t')).toBe('test-token')
  })
})

// ─── Middleware whitelist regression guard ────────────────
//
// /aro/u is a two-segment path that the middleware would otherwise treat as
// auth-required (it doesn't match the single-segment public-profile pattern
// and isn't under /api/). The fix: explicit entry in publicRoutes. This test
// reads the middleware source and asserts the entry is still there, so a
// future edit that accidentally removes it fails CI before it ever ships.
//
// This is a *static* test against the source file rather than an end-to-end
// HTTP test because (a) middleware tests in vitest would require running
// Next.js, and (b) the verification we already did in the dev preview is
// sufficient as one-off proof — the regression we want to catch is the line
// disappearing from the source.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('middleware /aro/u whitelist (regression guard)', () => {
  const middlewareSource = readFileSync(
    resolve(__dirname, '..', 'middleware.ts'),
    'utf-8',
  )

  it('publicRoutes contains /aro/u so the unsubscribe rewrite reaches the API route', () => {
    // Look for the literal string entry in the publicRoutes array.
    expect(middlewareSource).toContain("'/aro/u'")
  })

  it('the publicRoutes array still includes /api/ (so the direct API path also bypasses auth)', () => {
    expect(middlewareSource).toContain("'/api/'")
  })

  it('a developer comment explains why /aro/u is whitelisted', () => {
    // If someone refactors publicRoutes and drops the comment, the next
    // person to read it will not understand why /aro/u must stay public.
    // The comment is load-bearing for the CAN-SPAM rationale.
    expect(middlewareSource.toLowerCase()).toContain('can-spam')
  })
})

// ─── next.config.js rewrite regression guard ──────────────
//
// The /aro/u short URL only works because next.config.js rewrites it to
// /api/aro/unsubscribe. If someone removes that rewrite, the middleware
// whitelist still passes the request through but Next.js returns a 404
// because there's no app/aro/u route. This test asserts the rewrite is
// configured.

describe('next.config.js /aro/u rewrite (regression guard)', () => {
  const nextConfigSource = readFileSync(
    resolve(__dirname, '..', 'next.config.js'),
    'utf-8',
  )

  it('contains a rewrite from /aro/u to /api/aro/unsubscribe', () => {
    expect(nextConfigSource).toContain("source: '/aro/u'")
    expect(nextConfigSource).toContain("destination: '/api/aro/unsubscribe'")
  })
})
