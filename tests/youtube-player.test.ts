import { describe, expect, it } from 'vitest'
import {
  consumePendingYouTubeActivation,
  isYouTubePlayingMessage,
  pauseYouTubePlayback,
  primeYouTubePlayer,
  requestYouTubeActivation,
  YOUTUBE_MOBILE_REVEAL_SETTLE_MS,
  shouldMountYouTubePlayer,
  shouldPrewarmYouTubePlayer,
  shouldRevealYouTubePlayer,
  shouldShowYouTubePosterVeil,
  shouldUseYouTubePosterSurface,
  startYouTubePlayback,
  YOUTUBE_READY_SETTLE_MS,
  YOUTUBE_REVEAL_FALLBACK_MS,
  youtubePrewarmOptions,
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
  it('does not prewarm youtube before explicit activation', () => {
    expect(shouldPrewarmYouTubePlayer('youtube', true, true)).toBe(false)
    expect(shouldMountYouTubePlayer('youtube', false, true, true)).toBe(false)
  })

  it('mounts youtube after explicit activation', () => {
    expect(shouldMountYouTubePlayer('youtube', true, true, false)).toBe(true)
  })

  it('keeps the poster visible until playback is confirmed', () => {
    expect(shouldRevealYouTubePlayer(true, false)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, true)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, true, true)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, false, false, true)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, true, false, true)).toBe(true)
    expect(shouldRevealYouTubePlayer(true, false, true, true)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, false, false, true, true)).toBe(true)
  })

  it('keeps the Footprint poster veil over inactive or unrevealed youtube', () => {
    expect(shouldShowYouTubePosterVeil(false, false)).toBe(true)
    expect(shouldShowYouTubePosterVeil(false, true)).toBe(true)
    expect(shouldShowYouTubePosterVeil(true, false)).toBe(true)
    expect(shouldShowYouTubePosterVeil(true, true)).toBe(false)
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

    expect(messages.filter((message) => message.includes('"func":"playVideo"')).length).toBeGreaterThan(0)
    expect(messages.some((message) => message.includes('"func":"unMute"'))).toBe(true)
    expect(messages.some((message) => message.includes('"func":"setVolume"'))).toBe(true)
  })

  it('can pause playback when collection scrolling takes over', () => {
    const messages: string[] = []
    const iframe = {
      contentWindow: {
        postMessage(message: string) {
          messages.push(message)
        },
      },
    } as unknown as HTMLIFrameElement

    pauseYouTubePlayback(iframe)

    expect(messages).toEqual([
      '{"event":"command","func":"pauseVideo","args":""}',
    ])
  })

  it('queues exactly one pending activation when the player is not ready', () => {
    expect(requestYouTubeActivation(false)).toEqual({
      shouldPlayNow: false,
      pendingActivation: true,
    })
    expect(requestYouTubeActivation(true)).toEqual({
      shouldPlayNow: true,
      pendingActivation: false,
    })
  })

  it('fires pending activation exactly once when the player becomes ready', () => {
    expect(consumePendingYouTubeActivation(true)).toEqual({
      shouldPlayNow: true,
      pendingActivation: false,
    })
    expect(consumePendingYouTubeActivation(false)).toEqual({
      shouldPlayNow: false,
      pendingActivation: false,
    })
  })

  it('primes the hidden player without revealing it', () => {
    const messages: string[] = []
    const iframe = {
      contentWindow: {
        postMessage(message: string) {
          messages.push(message)
        },
      },
    } as unknown as HTMLIFrameElement

    primeYouTubePlayer(iframe, 'abc123')

    expect(messages).toEqual([
      '{"event":"listening","id":"abc123"}',
    ])
  })

  it('keeps the active iframe URL stable across activation', () => {
    expect(youtubePrewarmOptions(12, 34)).toEqual({
      autoplay: false,
      mute: true,
      start: 12,
      end: 34,
      hd: true,
    })
  })

  it('does not prewarm non-youtube tiles', () => {
    expect(shouldPrewarmYouTubePlayer('vimeo', true, true)).toBe(false)
    expect(shouldMountYouTubePlayer('vimeo', false, true, true)).toBe(false)
  })

  it('does not prewarm offscreen youtube tiles', () => {
    expect(shouldPrewarmYouTubePlayer('youtube', true, false)).toBe(false)
    expect(shouldMountYouTubePlayer('youtube', false, true, false)).toBe(false)
  })

  it('uses a single settled-ready delay for hidden priming', () => {
    expect(YOUTUBE_READY_SETTLE_MS).toBe(800)
  })

  it('keeps normal youtube veiled once activation has been consumed if PLAYING arrives late', () => {
    expect(shouldRevealYouTubePlayer(true, false, false, true)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, false, false, true, true)).toBe(true)
  })

  it('keeps poster-locked music hidden even after activation is consumed', () => {
    expect(shouldRevealYouTubePlayer(true, true, true, true)).toBe(false)
  })

  it('poster-locks only music-shaped youtube in sound rooms', () => {
    expect(shouldUseYouTubePosterSurface(true, false, 'square')).toBe(true)
    expect(shouldUseYouTubePosterSurface(true, false, 'wide')).toBe(false)
    expect(shouldUseYouTubePosterSurface(true, false, 'tall')).toBe(false)
    expect(shouldUseYouTubePosterSurface(true, true, 'tall')).toBe(false)
    expect(shouldUseYouTubePosterSurface(false, false, 'square')).toBe(false)
  })

  it('does not reveal normal youtube immediately on activation before play settles', () => {
    expect(shouldRevealYouTubePlayer(true, false, false, false, false)).toBe(false)
  })

  it('reveals normal youtube only after the play settle condition when ready-state reveal is disabled', () => {
    expect(shouldRevealYouTubePlayer(true, true, false, false, false)).toBe(false)
    expect(shouldRevealYouTubePlayer(true, false, false, true, true)).toBe(true)
  })

  it('uses a dedicated mobile settle delay for clean youtube reveal', () => {
    expect(YOUTUBE_MOBILE_REVEAL_SETTLE_MS).toBe(900)
    expect(YOUTUBE_REVEAL_FALLBACK_MS).toBe(1200)
  })
})
