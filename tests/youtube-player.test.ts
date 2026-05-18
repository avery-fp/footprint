import { describe, expect, it } from 'vitest'
import {
  isYouTubePlayingMessage,
  shouldMountYouTubePlayer,
  shouldPrewarmYouTubePlayer,
  shouldRevealYouTubePlayer,
  startYouTubePlayback,
} from '@/lib/youtube-player'

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

describe('mobile youtube prewarm contract', () => {
  it('prewarms and mounts youtube before first activation on coarse pointers', () => {
    expect(shouldPrewarmYouTubePlayer('youtube', true)).toBe(true)
    expect(shouldMountYouTubePlayer('youtube', false, true)).toBe(true)
  })

  it('keeps the poster visible until playback is confirmed', () => {
    expect(shouldRevealYouTubePlayer(true, false)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, true)).toBe(true)
  })

  it('starts playback on the already-mounted player on first activation', () => {
    const messages: string[] = []
    const iframe = {
      contentWindow: {
        postMessage(message: string) {
          messages.push(message)
        },
      },
    } as unknown as HTMLIFrameElement

    startYouTubePlayback(iframe)

    expect(messages.some((message) => message.includes('"func":"playVideo"'))).toBe(true)
  })

  it('does not prewarm non-youtube tiles', () => {
    expect(shouldPrewarmYouTubePlayer('vimeo', true)).toBe(false)
    expect(shouldMountYouTubePlayer('vimeo', false, true)).toBe(false)
  })
})
