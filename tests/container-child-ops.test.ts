import { describe, it, expect } from 'vitest'
import { moveChild, removeChild, titleFromUrl } from '@/lib/container-child-ops'

const make = (id: string, position: number) => ({ id, position, source: 'links' as const })

describe('moveChild', () => {
  it('moves an item left (dir = -1)', () => {
    const arr = [make('a', 0), make('b', 1), make('c', 2)]
    const result = moveChild(arr, 1, -1)
    expect(result.map(c => c.id)).toEqual(['b', 'a', 'c'])
  })

  it('moves an item right (dir = +1)', () => {
    const arr = [make('a', 0), make('b', 1), make('c', 2)]
    const result = moveChild(arr, 1, 1)
    expect(result.map(c => c.id)).toEqual(['a', 'c', 'b'])
  })

  it('does nothing when already at left boundary', () => {
    const arr = [make('a', 0), make('b', 1)]
    const result = moveChild(arr, 0, -1)
    expect(result.map(c => c.id)).toEqual(['a', 'b'])
  })

  it('does nothing when already at right boundary', () => {
    const arr = [make('a', 0), make('b', 1)]
    const result = moveChild(arr, 1, 1)
    expect(result.map(c => c.id)).toEqual(['a', 'b'])
  })

  it('reassigns positions 0, 1, 2... after move', () => {
    const arr = [make('a', 10), make('b', 20), make('c', 30)]
    const result = moveChild(arr, 0, 1)
    expect(result.map(c => c.position)).toEqual([0, 1, 2])
  })

  it('does not mutate the original array', () => {
    const arr = [make('a', 0), make('b', 1)]
    moveChild(arr, 0, 1)
    expect(arr[0].id).toBe('a')
  })
})

describe('removeChild', () => {
  it('removes item by id', () => {
    const arr = [make('a', 0), make('b', 1), make('c', 2)]
    const result = removeChild(arr, 'b')
    expect(result.map(c => c.id)).toEqual(['a', 'c'])
  })

  it('returns same items when id not found', () => {
    const arr = [make('a', 0), make('b', 1)]
    const result = removeChild(arr, 'z')
    expect(result.map(c => c.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the original array', () => {
    const arr = [make('a', 0), make('b', 1)]
    removeChild(arr, 'a')
    expect(arr.length).toBe(2)
  })
})

describe('titleFromUrl', () => {
  it('returns hostname without www', () => {
    expect(titleFromUrl('https://www.example.com/page')).toBe('example.com')
  })

  it('returns bare hostname when no www', () => {
    expect(titleFromUrl('https://github.com/user/repo')).toBe('github.com')
  })

  it('strips www but keeps subdomain', () => {
    expect(titleFromUrl('https://shop.example.com/item')).toBe('shop.example.com')
  })

  it('handles invalid url by truncating input', () => {
    expect(titleFromUrl('not-a-url')).toBe('not-a-url')
  })

  it('truncates very long invalid input to 80 chars', () => {
    const long = 'x'.repeat(120)
    expect(titleFromUrl(long).length).toBe(80)
  })
})
