import { describe, it, expect } from 'vitest'
import { humanError, humanUsernameReason } from '@/lib/errors'

describe('humanError', () => {
  it('maps Postgres duplicate key error', () => {
    expect(humanError({ code: '23505' })).toBe('That name is already claimed. Try another.')
  })

  it('maps auth errors', () => {
    expect(humanError('Invalid or expired link')).toBe('That link has expired. Request a new one.')
    expect(humanError('Token is required')).toBe('That link has expired. Request a new one.')
  })

  it('maps signup errors', () => {
    expect(humanError('Username taken')).toBe('That name is already claimed. Try another.')
    expect(humanError('Invalid email')).toBe('Enter a valid email address.')
    expect(humanError('All fields required')).toBe('Please fill in all fields.')
  })

  it('maps payment errors', () => {
    expect(humanError('Invalid promo code')).toContain("didn't work")
    expect(humanError('Promo code expired')).toContain('expired')
  })

  it('detects rate limit errors from message text', () => {
    expect(humanError({ message: 'rate limit exceeded' })).toContain('Too many')
    expect(humanError({ message: 'Error 429' })).toContain('Too many')
  })

  it('detects timeout errors from message text', () => {
    expect(humanError({ message: 'Request timeout' })).toContain('timed out')
    expect(humanError({ message: 'ETIMEDOUT' })).toContain('timed out')
  })

  it('detects network errors from message text', () => {
    expect(humanError({ message: 'network error' })).toContain('Connection lost')
    expect(humanError({ message: 'Failed to fetch' })).toContain('Connection lost')
  })

  it('returns generic message for null/undefined', () => {
    expect(humanError(null)).toBe('Something went wrong. Try again.')
    expect(humanError(undefined)).toBe('Something went wrong. Try again.')
  })

  it('returns generic message for unknown errors', () => {
    expect(humanError({ code: 'UNKNOWN_CODE', message: 'something unexpected' })).toBe('Something went wrong. Try again.')
  })

  it('never exposes raw error codes', () => {
    const result = humanError({ code: '23505', message: 'duplicate key value violates unique constraint' })
    expect(result).not.toContain('23505')
    expect(result).not.toContain('duplicate key')
    expect(result).not.toContain('constraint')
  })

  it('prefers code over message when both match', () => {
    const result = humanError({ code: '23505', message: 'Invalid email' })
    expect(result).toBe('That name is already claimed. Try another.')
  })
})

describe('humanUsernameReason', () => {
  it('maps known reasons', () => {
    expect(humanUsernameReason('taken')).toContain('already claimed')
    expect(humanUsernameReason('reserved')).toContain('reserved')
    expect(humanUsernameReason('2-20 characters')).toContain('2-20')
  })

  it('passes through unknown reasons', () => {
    expect(humanUsernameReason('some custom reason')).toBe('some custom reason')
  })
})
