import { describe, it, expect } from 'vitest'
import { AUTH_ENTRY, authEntryFor } from '@/lib/routes'

/**
 * Unit tests for the auth-entry helper.
 *
 * This is the single source of truth for the canonical sign-in entry point.
 * These tests pin the contract so future edits can't silently re-introduce
 * the dead /login redirect that caused the original sign-in loop.
 */

describe('AUTH_ENTRY', () => {
  it('points at /ae?claim=1, the canonical unauthenticated entry', () => {
    expect(AUTH_ENTRY).toBe('/ae?claim=1')
  })
})

describe('authEntryFor', () => {
  it('returns AUTH_ENTRY when no slug is given', () => {
    expect(authEntryFor()).toBe(AUTH_ENTRY)
  })

  it('returns AUTH_ENTRY for null', () => {
    expect(authEntryFor(null)).toBe(AUTH_ENTRY)
  })

  it('returns AUTH_ENTRY for empty string', () => {
    expect(authEntryFor('')).toBe(AUTH_ENTRY)
  })

  it('returns slug-aware claim entry for a valid slug', () => {
    expect(authEntryFor('john')).toBe('/john?claim=1')
    expect(authEntryFor('ae')).toBe('/ae?claim=1')
    expect(authEntryFor('user_42')).toBe('/user_42?claim=1')
    expect(authEntryFor('a-b-c')).toBe('/a-b-c?claim=1')
  })

  it('falls back to AUTH_ENTRY for slugs containing path traversal', () => {
    expect(authEntryFor('../etc/passwd')).toBe(AUTH_ENTRY)
    expect(authEntryFor('foo/bar')).toBe(AUTH_ENTRY)
    expect(authEntryFor('foo?bar')).toBe(AUTH_ENTRY)
    expect(authEntryFor('foo#bar')).toBe(AUTH_ENTRY)
  })

  it('falls back to AUTH_ENTRY for slugs with whitespace or control chars', () => {
    expect(authEntryFor('foo bar')).toBe(AUTH_ENTRY)
    expect(authEntryFor('\nfoo')).toBe(AUTH_ENTRY)
  })
})
