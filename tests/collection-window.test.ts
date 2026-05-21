import { describe, expect, it } from 'vitest'

import {
  clampCollectionIndex,
  getCollectionRenderRadius,
  getCollectionRenderWindow,
  shouldRenderCollectionTile,
} from '@/lib/collection-window'

describe('collection render window', () => {
  it('clamps invalid active indexes into bounds', () => {
    expect(clampCollectionIndex(-3, 7)).toBe(0)
    expect(clampCollectionIndex(99, 7)).toBe(6)
    expect(clampCollectionIndex(Number.NaN, 7)).toBe(0)
  })

  it('returns a symmetric window around the active child when possible', () => {
    expect(getCollectionRenderWindow(9, 4, 1)).toEqual({ start: 3, end: 5 })
    expect(getCollectionRenderWindow(9, 4, 2)).toEqual({ start: 2, end: 6 })
  })

  it('handles empty, one, and two-item collections without overflow', () => {
    expect(getCollectionRenderWindow(0, 0, 1)).toEqual({ start: 0, end: -1 })
    expect(getCollectionRenderWindow(1, 0, 1)).toEqual({ start: 0, end: 0 })
    expect(getCollectionRenderWindow(2, 0, 1)).toEqual({ start: 0, end: 1 })
    expect(getCollectionRenderWindow(2, 1, 1)).toEqual({ start: 0, end: 1 })
  })

  it('pins the window at the edges without overflowing', () => {
    expect(getCollectionRenderWindow(9, 0, 2)).toEqual({ start: 0, end: 2 })
    expect(getCollectionRenderWindow(9, 8, 2)).toEqual({ start: 6, end: 8 })
  })

  it('keeps tiny collections fully mounted when the radius covers them', () => {
    expect(getCollectionRenderWindow(3, 1, 2)).toEqual({ start: 0, end: 2 })
  })

  it('marks only the active child and its neighbors as mounted', () => {
    const mounted = Array.from({ length: 7 }, (_, index) =>
      shouldRenderCollectionTile(index, 7, 3, 1)
    )
    expect(mounted).toEqual([false, false, true, true, true, false, false])
  })

  it('caps the mounted window at 3 items on mobile and 5 on desktop', () => {
    const mobile = getCollectionRenderWindow(20, 10, getCollectionRenderRadius(true))
    const desktop = getCollectionRenderWindow(20, 10, getCollectionRenderRadius(false))
    expect(mobile.end - mobile.start + 1).toBe(3)
    expect(desktop.end - desktop.start + 1).toBe(5)
  })

  it('placeholder count matches offscreen items in larger collections', () => {
    const mobileWindow = getCollectionRenderWindow(8, 3, getCollectionRenderRadius(true))
    const mounted = mobileWindow.end - mobileWindow.start + 1
    expect(8 - mounted).toBe(5)
  })
})
