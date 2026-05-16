import { describe, expect, it } from 'vitest'
import { getGridClass, resolveAspect } from '@/lib/media/aspect'

describe('music aspect rules', () => {
  it('defaults music tiles to the compact bar', () => {
    expect(resolveAspect(null, 'spotify')).toBe('wide')
    expect(resolveAspect(undefined, 'apple_music')).toBe('wide')
  })

  it('only preserves square as an alternate music shape', () => {
    expect(resolveAspect('square', 'spotify')).toBe('square')
    expect(resolveAspect('wide', 'spotify')).toBe('wide')
    expect(resolveAspect('tall', 'spotify')).toBe('wide')
  })

  it('uses the short music bar geometry for wide music', () => {
    expect(getGridClass(1, 'wide', false, 'spotify')).toContain('aspect-[11/2]')
    expect(getGridClass(1, 'wide', false, 'apple_music')).toContain('aspect-[11/2]')
  })
})
