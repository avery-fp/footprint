import { describe, expect, it } from 'vitest'
import { beginInvocation, isIntentionalInvocation, MOBILE_INVOCATION_TOLERANCE_PX } from '@/lib/media-invocation'

describe('media invocation intent', () => {
  it('accepts forgiving near-center taps', () => {
    const start = beginInvocation(1, 100, 100)
    expect(isIntentionalInvocation(start, 1, 112, 110)).toBe(true)
  })

  it('rejects scroll and swipe movement', () => {
    const start = beginInvocation(1, 100, 100)
    expect(isIntentionalInvocation(start, 1, 100 + MOBILE_INVOCATION_TOLERANCE_PX + 1, 100)).toBe(false)
    expect(isIntentionalInvocation(start, 1, 100, 100 + MOBILE_INVOCATION_TOLERANCE_PX + 1)).toBe(false)
  })

  it('rejects a different pointer id', () => {
    const start = beginInvocation(1, 100, 100)
    expect(isIntentionalInvocation(start, 2, 100, 100)).toBe(false)
  })
})
