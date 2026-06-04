import { describe, expect, it } from 'vitest'
import { getGridClass, resolveAspect } from '@/lib/media/aspect'

describe('music aspect rules', () => {
  it('uses provider-native default music geometry', () => {
    expect(resolveAspect(null, 'spotify')).toBe('wide')
    expect(resolveAspect(undefined, 'apple_music')).toBe('square')
  })

  it('only preserves square as an alternate music shape', () => {
    expect(resolveAspect('square', 'spotify')).toBe('square')
    expect(resolveAspect('wide', 'spotify')).toBe('wide')
    expect(resolveAspect('tall', 'spotify')).toBe('wide')
  })

  it('uses provider-specific wide music geometry', () => {
    expect(getGridClass(1, 'wide', false, 'spotify')).toContain('aspect-[11/2]')
    expect(getGridClass(1, 'wide', false, 'apple_music')).toContain('aspect-[5/2]')
  })

  it('lets square music tiles grow with size', () => {
    expect(getGridClass(1, 'square', false, 'spotify')).toContain('col-span-1')
    expect(getGridClass(2, 'square', false, 'spotify')).toContain('col-span-2')
    expect(getGridClass(3, 'square', false, 'apple_music')).toContain('md:col-span-3')
  })
})

describe('video aspect rules', () => {
  it('preserves square as real video geometry', () => {
    expect(resolveAspect('square', 'youtube')).toBe('square')
    expect(getGridClass(1, 'square', true, 'youtube')).toContain('aspect-square')
    expect(getGridClass(1, 'wide', true, 'youtube')).toContain('aspect-video')
    expect(getGridClass(1, 'tall', true, 'youtube')).toContain('aspect-[9/16]')
  })
})
