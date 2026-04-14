import { describe, it, expect } from 'vitest'
import { sanitizeRedirect } from '@/lib/redirect'

/**
 * Unit tests for sanitizeRedirect — the single gatekeeper for any
 * user-supplied post-auth redirect destination.
 *
 * Any path that survives this function is safe to pass to NextResponse.redirect
 * on a same-origin basis. Anything else must collapse to null so the caller
 * falls back to a trusted default.
 */
describe('sanitizeRedirect', () => {
  it('returns a bare internal path unchanged', () => {
    expect(sanitizeRedirect('/home')).toBe('/home')
    expect(sanitizeRedirect('/ae/home')).toBe('/ae/home')
  })

  it('preserves query strings on internal paths', () => {
    expect(sanitizeRedirect('/ae?claim=1')).toBe('/ae?claim=1')
    expect(sanitizeRedirect('/ae?claim=1&username=bob')).toBe('/ae?claim=1&username=bob')
  })

  it('rejects protocol-relative URLs', () => {
    expect(sanitizeRedirect('//evil.com/steal')).toBeNull()
    expect(sanitizeRedirect('//evil.com')).toBeNull()
  })

  it('rejects absolute URLs', () => {
    expect(sanitizeRedirect('https://evil.com/steal')).toBeNull()
    expect(sanitizeRedirect('http://footprint.onl/home')).toBeNull()
  })

  it('rejects paths that do not start with /', () => {
    expect(sanitizeRedirect('home')).toBeNull()
    expect(sanitizeRedirect('./home')).toBeNull()
    expect(sanitizeRedirect('../etc/passwd')).toBeNull()
  })

  it('rejects empty, null, undefined, and non-string input', () => {
    expect(sanitizeRedirect('')).toBeNull()
    expect(sanitizeRedirect(null)).toBeNull()
    expect(sanitizeRedirect(undefined)).toBeNull()
    expect(sanitizeRedirect(123 as unknown as string)).toBeNull()
    expect(sanitizeRedirect({} as unknown as string)).toBeNull()
  })

  it('rejects javascript: and data: scheme attempts disguised as paths', () => {
    expect(sanitizeRedirect('javascript:alert(1)')).toBeNull()
    expect(sanitizeRedirect('data:text/html,<script>')).toBeNull()
  })

  it('rejects whitespace, CR/LF, and control characters that could split responses', () => {
    expect(sanitizeRedirect('/foo\n/bar')).toBeNull()
    expect(sanitizeRedirect('/foo\r\nSet-Cookie: a=b')).toBeNull()
    expect(sanitizeRedirect('/foo bar')).toBeNull()
    expect(sanitizeRedirect(' /foo')).toBeNull()
  })

  it('rejects backslash-based path traversal some proxies treat as /', () => {
    expect(sanitizeRedirect('/\\evil.com')).toBeNull()
    expect(sanitizeRedirect('\\\\evil.com')).toBeNull()
  })
})
