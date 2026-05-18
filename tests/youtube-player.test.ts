import { describe, expect, it } from 'vitest'
import { shouldOpenYouTubeFocusOnActivate } from '@/lib/youtube-player'

describe('shouldOpenYouTubeFocusOnActivate', () => {
  const coarse = () => ({ matches: true })
  const fine = () => ({ matches: false })

  it('opens focus immediately for youtube on coarse pointers', () => {
    expect(shouldOpenYouTubeFocusOnActivate('youtube', coarse)).toBe(true)
  })

  it('does not open focus immediately for youtube on fine pointers', () => {
    expect(shouldOpenYouTubeFocusOnActivate('youtube', fine)).toBe(false)
  })

  it('does not affect non-youtube tiles on coarse pointers', () => {
    expect(shouldOpenYouTubeFocusOnActivate('vimeo', coarse)).toBe(false)
  })
})
