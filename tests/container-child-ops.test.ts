import { describe, it, expect } from 'vitest'
import { removeChild } from '@/lib/container-child-ops'

const make = (id: string) => ({ id, source: 'links' as const })

describe('removeChild', () => {
  it('removes item by id', () => {
    const arr = [make('a'), make('b'), make('c')]
    expect(removeChild(arr, 'b').map(c => c.id)).toEqual(['a', 'c'])
  })

  it('no-ops when id not found', () => {
    const arr = [make('a'), make('b')]
    expect(removeChild(arr, 'z').map(c => c.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the original array', () => {
    const arr = [make('a'), make('b')]
    removeChild(arr, 'a')
    expect(arr.length).toBe(2)
  })
})
