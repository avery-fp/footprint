import { describe, it, expect } from 'vitest'
import { extractLinkPreview } from '@/lib/og'

const SRC = 'https://example.com/page?ref=1'

describe('extractLinkPreview', () => {
  it('pulls og:title / og:description / og:image / og:site_name / og:type', () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="A Title">
      <meta property="og:description" content="A description.">
      <meta property="og:image" content="https://cdn.example.com/img.jpg">
      <meta property="og:site_name" content="Example">
      <meta property="og:type" content="website">
    </head></html>`
    const out = extractLinkPreview(html, SRC)
    expect(out.title).toBe('A Title')
    expect(out.description).toBe('A description.')
    expect(out.image).toBe('https://cdn.example.com/img.jpg')
    expect(out.siteName).toBe('Example')
    expect(out.type).toBe('website')
    expect(out.url).toBe(SRC)
  })

  it('falls back to twitter:* meta when og:* missing', () => {
    const html = `<head>
      <meta name="twitter:title" content="Twitter Title">
      <meta name="twitter:description" content="Twitter desc">
      <meta name="twitter:image" content="https://cdn.example.com/t.jpg">
    </head>`
    const out = extractLinkPreview(html, SRC)
    expect(out.title).toBe('Twitter Title')
    expect(out.description).toBe('Twitter desc')
    expect(out.image).toBe('https://cdn.example.com/t.jpg')
  })

  it('falls back to <title> when no og/twitter title', () => {
    const out = extractLinkPreview('<html><head><title> Just a Page </title></head></html>', SRC)
    expect(out.title).toBe('Just a Page')
  })

  it('resolves relative og:image against the source URL', () => {
    const html = `<meta property="og:image" content="/static/hero.png">`
    const out = extractLinkPreview(html, 'https://www.grailed.com/u/foo')
    expect(out.image).toBe('https://www.grailed.com/static/hero.png')
  })

  it('rejects non-http(s) image schemes', () => {
    const html = `<meta property="og:image" content="javascript:alert(1)">`
    const out = extractLinkPreview(html, SRC)
    expect(out.image).toBeNull()
  })

  it('extracts canonical link', () => {
    const html = `<link rel="canonical" href="https://example.com/canonical">`
    const out = extractLinkPreview(html, SRC)
    expect(out.canonical).toBe('https://example.com/canonical')
  })

  it('decodes HTML entities in title/description', () => {
    const html = `<meta property="og:title" content="Hello &amp; Goodbye">
                  <meta property="og:description" content="It&#39;s &quot;fine&quot;">`
    const out = extractLinkPreview(html, SRC)
    expect(out.title).toBe('Hello & Goodbye')
    expect(out.description).toBe(`It's "fine"`)
  })

  it('returns all-null fields for empty HTML (never throws)', () => {
    const out = extractLinkPreview('', SRC)
    expect(out).toEqual({
      url: SRC,
      canonical: null,
      title: null,
      description: null,
      image: null,
      siteName: null,
      type: null,
    })
  })

  it('handles attribute order: content first, then property', () => {
    const html = `<meta content="Reversed" property="og:title">`
    expect(extractLinkPreview(html, SRC).title).toBe('Reversed')
  })
})
