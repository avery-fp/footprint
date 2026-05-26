import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUDIO_AUTHORITY, audioManager } from '@/lib/audio-manager'

function media(overrides: Partial<HTMLMediaElement> = {}) {
  return {
    volume: 1,
    muted: false,
    pause: vi.fn(),
    ...overrides,
  } as unknown as HTMLMediaElement
}

describe('audioManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    audioManager._resetForTests()
  })

  afterEach(() => {
    audioManager._resetForTests()
    vi.useRealTimers()
  })

  it('stops every other registered audio surface when a new one plays', () => {
    const stopped: string[] = []
    const a = 'audio-a'
    const b = 'audio-b'
    const c = 'audio-c'

    audioManager.register(a, () => stopped.push(a))
    audioManager.register(b, () => stopped.push(b))
    audioManager.register(c, () => stopped.push(c))

    audioManager.play(b)
    expect(stopped).toEqual([a, c])
  })

  it('native activation starts quiet and fades to the authority volume', () => {
    const el = media({ volume: 1, muted: true })

    audioManager.playNative('native-a', el)

    expect(el.muted).toBe(false)
    expect(el.volume).toBe(0.08)

    vi.advanceTimersByTime(AUDIO_AUTHORITY.fadeMs + 20)
    expect(el.volume).toBe(AUDIO_AUTHORITY.nativeMediaVolume)
  })

  it('provider activation ducks room audio and release restores it', () => {
    const room = media({ volume: AUDIO_AUTHORITY.roomVolume })
    audioManager.registerRoomSource('room', room)

    audioManager.activateProvider('youtube-a')
    vi.advanceTimersByTime(AUDIO_AUTHORITY.fadeMs + 20)
    expect(room.volume).toBe(AUDIO_AUTHORITY.roomDuckedVolume)

    audioManager.release('youtube-a')
    vi.advanceTimersByTime(AUDIO_AUTHORITY.fadeMs + 20)
    expect(room.volume).toBe(AUDIO_AUTHORITY.roomVolume)
  })

  it('release does not restore room audio if another source took authority', () => {
    const room = media({ volume: AUDIO_AUTHORITY.roomVolume })
    audioManager.registerRoomSource('room', room)

    audioManager.activateProvider('youtube-a')
    audioManager.activateProvider('spotify-b')
    audioManager.release('youtube-a')
    vi.advanceTimersByTime(AUDIO_AUTHORITY.fadeMs + 20)

    expect(room.volume).toBe(AUDIO_AUTHORITY.roomDuckedVolume)
  })
})
