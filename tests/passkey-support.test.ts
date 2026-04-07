import { describe, it, expect, afterEach } from 'vitest'
import { isPasskeySupported } from '@/components/auth/passkey-support'

/**
 * Unit tests for the passkey support helper.
 *
 * The helper is the SSR-safe gate that hides the PasskeyButton on browsers
 * (or environments) that don't speak WebAuthn. Keep it dead simple — the
 * heavy lifting is delegated to @simplewebauthn/browser at click time.
 */

describe('isPasskeySupported', () => {
  const originalWindow = (globalThis as any).window

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window
    } else {
      ;(globalThis as any).window = originalWindow
    }
  })

  it('returns false when window is undefined (SSR / node)', () => {
    delete (globalThis as any).window
    expect(isPasskeySupported()).toBe(false)
  })

  it('returns true when window.PublicKeyCredential exists', () => {
    ;(globalThis as any).window = { PublicKeyCredential: function () {} }
    expect(isPasskeySupported()).toBe(true)
  })

  it('returns false when window exists but PublicKeyCredential is missing', () => {
    ;(globalThis as any).window = {}
    expect(isPasskeySupported()).toBe(false)
  })
})
