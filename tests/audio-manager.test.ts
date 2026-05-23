import { describe, expect, it } from 'vitest'
import { audioManager } from '@/lib/audio-manager'

describe('audioManager', () => {
  it('stops every other registered audio surface when a new one plays', () => {
    const stopped: string[] = []
    const a = `audio-a-${Math.random()}`
    const b = `audio-b-${Math.random()}`
    const c = `audio-c-${Math.random()}`

    audioManager.register(a, () => stopped.push(a))
    audioManager.register(b, () => stopped.push(b))
    audioManager.register(c, () => stopped.push(c))

    try {
      audioManager.play(b)
      expect(stopped).toEqual([a, c])
    } finally {
      audioManager.unregister(a)
      audioManager.unregister(b)
      audioManager.unregister(c)
      audioManager.mute(b)
    }
  })
})
