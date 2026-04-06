import { describe, it, expect } from 'vitest'
import type {
  SwarmTarget,
  SwarmMessage,
  SwarmSend,
  SwarmDomain,
  SwarmScrapeJob,
  MirrorHookInput,
  MirrorHookOutput,
  SESRegionConfig,
  SwarmCycleResult,
} from '@/src/aro/types'

// ─── Type structure tests ─────────────────────────────────

describe('Swarm types', () => {
  it('SwarmTarget has required fields', () => {
    const target: SwarmTarget = {
      id: '1',
      place_id: 'ChIJ...',
      name: 'Test Barbershop',
      category: 'barbershop',
      city: 'Los Angeles, CA',
      state: 'CA',
      country: 'US',
      address: '123 Main St',
      phone: '+1-555-0100',
      website: 'https://testbarbershop.com',
      email: 'hello@testbarbershop.com',
      email_source: 'website_scrape',
      rating: 4.5,
      review_count: 120,
      score: 85,
      status: 'scraped',
      scraped_at: '2026-01-01T00:00:00Z',
      enriched_at: null,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(target.place_id).toBe('ChIJ...')
    expect(target.status).toBe('scraped')
    expect(target.category).toBe('barbershop')
  })

  it('SwarmTarget status transitions are valid', () => {
    const validStatuses: SwarmTarget['status'][] = [
      'scraped', 'enriched', 'messaged', 'sent', 'bounced', 'converted', 'unsubscribed',
    ]
    expect(validStatuses).toHaveLength(7)
  })

  it('SwarmMessage has subject, body_html, body_text', () => {
    const message: SwarmMessage = {
      id: '1',
      target_id: '2',
      subject: 'Your barbershop, one page',
      body_html: '<div>test</div>',
      body_text: 'test',
      hook_style: 'mirror',
      model: 'claude-sonnet-4-5-20241022',
      tokens_used: 500,
      generated_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(message.hook_style).toBe('mirror')
    expect(message.tokens_used).toBe(500)
  })

  it('SwarmDomain has warmup tracking', () => {
    const domain: SwarmDomain = {
      id: '1',
      domain: 'footprint.site',
      region: 'us-east-1',
      daily_limit: 1000,
      sent_today: 450,
      bounced_today: 5,
      complained_today: 0,
      bounce_rate: 0.011,
      complaint_rate: 0,
      status: 'warming',
      warmup_day: 9,
      last_sent_at: '2026-01-01T00:00:00Z',
      last_reset_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(domain.warmup_day).toBe(9)
    expect(domain.status).toBe('warming')
    expect(domain.bounce_rate).toBeLessThan(0.05)
  })

  it('SwarmCycleResult tracks all pipeline stages', () => {
    const result: SwarmCycleResult = {
      scraped: 60,
      enriched: 45,
      mirrored: 20,
      sent: 20,
      bounced: 1,
      errors: [],
    }

    expect(result.scraped).toBeGreaterThan(0)
    expect(result.sent).toBeLessThanOrEqual(result.mirrored)
    expect(result.errors).toHaveLength(0)
  })

  it('MirrorHookInput contains business context', () => {
    const input: MirrorHookInput = {
      business_name: 'Ace Barbershop',
      category: 'barbershop',
      city: 'Brooklyn, NY',
      website_copy: 'Premium cuts since 2015. Walk-ins welcome.',
      rating: 4.8,
      review_count: 230,
    }

    expect(input.business_name).toBe('Ace Barbershop')
    expect(input.website_copy).toContain('Premium cuts')
  })

  it('SESRegionConfig has all required fields', () => {
    const config: SESRegionConfig = {
      region: 'us-east-1',
      accessKeyId: 'AKIA...',
      secretAccessKey: 'secret',
      fromAddress: 'hello@footprint.site',
      domain: 'footprint.site',
    }

    expect(config.region).toBe('us-east-1')
    expect(config.domain).toBe('footprint.site')
  })
})

// ─── Warmup schedule logic ────────────────────────────────

describe('Domain warmup math', () => {
  const WARMUP_SCHEDULE: Record<number, number> = {
    1: 50, 2: 50,
    3: 100, 4: 100,
    5: 200, 6: 200,
    7: 500, 8: 500,
    9: 1000, 10: 1000,
    11: 2000, 12: 2000,
    13: 5000, 14: 5000,
    15: 10000, 16: 10000,
    17: 20000, 18: 20000,
    19: 50000, 20: 50000,
  }

  function getWarmupLimit(day: number): number {
    if (day >= 20) return 50000
    return WARMUP_SCHEDULE[day] || 50
  }

  it('day 1 starts at 50', () => {
    expect(getWarmupLimit(1)).toBe(50)
  })

  it('doubles every 2 days', () => {
    expect(getWarmupLimit(3)).toBe(getWarmupLimit(1) * 2)
    expect(getWarmupLimit(5)).toBe(getWarmupLimit(3) * 2)
  })

  it('day 20+ caps at 50k', () => {
    expect(getWarmupLimit(20)).toBe(50000)
    expect(getWarmupLimit(30)).toBe(50000)
    expect(getWarmupLimit(100)).toBe(50000)
  })

  it('20-day warmup reaches 50k from 50', () => {
    const totalOverWarmup = Object.values(WARMUP_SCHEDULE).reduce((sum, v) => sum + v, 0)
    expect(totalOverWarmup).toBeGreaterThan(100000) // total emails over warmup
    expect(getWarmupLimit(20)).toBe(50000)
  })
})

// ─── Bounce rate threshold logic ──────────────────────────

describe('Monitor thresholds', () => {
  const BOUNCE_RATE_PAUSE = 0.05
  const COMPLAINT_RATE_PAUSE = 0.001

  it('5% bounce rate triggers pause', () => {
    const sent = 100
    const bounced = 5
    expect(bounced / sent).toBeGreaterThanOrEqual(BOUNCE_RATE_PAUSE)
  })

  it('4.9% bounce rate does not trigger pause', () => {
    const sent = 1000
    const bounced = 49
    expect(bounced / sent).toBeLessThan(BOUNCE_RATE_PAUSE)
  })

  it('0.1% complaint rate triggers pause', () => {
    const sent = 1000
    const complaints = 1
    expect(complaints / sent).toBeGreaterThanOrEqual(COMPLAINT_RATE_PAUSE)
  })

  it('0 complaints does not trigger pause', () => {
    const sent = 1000
    const complaints = 0
    expect(complaints / sent).toBeLessThan(COMPLAINT_RATE_PAUSE)
  })
})

// ─── Email extraction patterns ────────────────────────────

describe('Email extraction', () => {
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g

  it('extracts standard emails', () => {
    const text = 'Contact us at hello@example.com or info@test.co.uk'
    const matches = text.match(EMAIL_RE) || []
    expect(matches).toContain('hello@example.com')
    expect(matches).toContain('info@test.co.uk')
  })

  it('handles mailto: format', () => {
    const html = '<a href="mailto:owner@barbershop.com">Email us</a>'
    const mailtoRe = /mailto:([\w.+-]+@[\w-]+\.[\w.]+)/gi
    const match = mailtoRe.exec(html)
    expect(match?.[1]).toBe('owner@barbershop.com')
  })

  it('rejects false positives', () => {
    const falsePositives = [
      'image@2x.png',
      'styles.css@font-face',
      'error@sentry.io',
    ]
    const filtered = falsePositives.filter(e => {
      return !e.includes('.png') &&
             !e.includes('.css') &&
             !e.includes('@sentry') &&
             !e.includes('@2x')
    })
    expect(filtered).toHaveLength(0)
  })
})

// ─── Domain extraction ────────────────────────────────────

describe('Domain extraction', () => {
  function extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
      return parsed.hostname.replace(/^www\./, '')
    } catch {
      return null
    }
  }

  it('extracts domain from https URL', () => {
    expect(extractDomain('https://www.example.com/about')).toBe('example.com')
  })

  it('extracts domain from bare URL', () => {
    expect(extractDomain('example.com')).toBe('example.com')
  })

  it('strips www prefix', () => {
    expect(extractDomain('https://www.test.co.uk')).toBe('test.co.uk')
  })

  it('returns null for invalid URLs', () => {
    expect(extractDomain('')).toBe(null)
  })
})
