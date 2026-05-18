import { describe, expect, it } from 'vitest'
import { isYouTubePlayingMessage } from '@/lib/youtube-player'

describe('isYouTubePlayingMessage', () => {
  it('accepts onStateChange playing events', () => {
    expect(isYouTubePlayingMessage({ event: 'onStateChange', info: 1 })).toBe(true)
  })

  it('accepts infoDelivery playing events', () => {
    expect(isYouTubePlayingMessage({ event: 'infoDelivery', info: { playerState: 1 } })).toBe(true)
  })

  it('rejects non-playing states', () => {
    expect(isYouTubePlayingMessage({ event: 'onStateChange', info: 0 })).toBe(false)
  })
})
