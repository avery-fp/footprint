import { describe, it, expect, beforeAll } from 'vitest'
import { createSessionToken, verifySessionToken } from '@/lib/auth'

// Set dev JWT secret for tests
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-vitest-only'
})

describe('createSessionToken + verifySessionToken', () => {
  it('creates a valid JWT that can be verified', async () => {
    const token = await createSessionToken('user-123', 'test@example.com')
    expect(token).toBeTypeOf('string')
    expect(token.split('.')).toHaveLength(3) // JWT has 3 parts

    const result = await verifySessionToken(token)
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('user-123')
    expect(result!.email).toBe('test@example.com')
  })

  it('returns null for garbage tokens', async () => {
    const result = await verifySessionToken('not-a-jwt')
    expect(result).toBeNull()
  })

  it('returns null for empty string', async () => {
    const result = await verifySessionToken('')
    expect(result).toBeNull()
  })

  it('returns null for tampered JWT', async () => {
    const token = await createSessionToken('user-123', 'test@example.com')
    const tampered = token.slice(0, -5) + 'XXXXX'
    const result = await verifySessionToken(tampered)
    expect(result).toBeNull()
  })

  it('rejects JWTs with missing userId field', async () => {
    // Manually sign a JWT without userId
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-secret-key-for-vitest-only')
    const badToken = await new SignJWT({ email: 'test@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    const result = await verifySessionToken(badToken)
    expect(result).toBeNull()
  })

  it('rejects JWTs with missing email field', async () => {
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-secret-key-for-vitest-only')
    const badToken = await new SignJWT({ userId: 'user-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    const result = await verifySessionToken(badToken)
    expect(result).toBeNull()
  })

  it('rejects JWTs with non-string userId', async () => {
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-secret-key-for-vitest-only')
    const badToken = await new SignJWT({ userId: 12345, email: 'test@example.com' } as any)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    const result = await verifySessionToken(badToken)
    expect(result).toBeNull()
  })

  it('rejects expired JWTs', async () => {
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-secret-key-for-vitest-only')
    const expiredToken = await new SignJWT({ userId: 'user-123', email: 'test@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // issued 2h ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1h ago
      .sign(secret)

    const result = await verifySessionToken(expiredToken)
    expect(result).toBeNull()
  })
})
