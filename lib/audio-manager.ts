// Global audio spine for one-sound-at-a-time.
// Explicit playback invocation stops every other registered audio surface.

type AudioCallback = () => void

class AudioManager {
  private currentPlayingId: string | null = null
  private muteCallbacks: Map<string, AudioCallback> = new Map()

  register(id: string, muteCallback: AudioCallback) {
    this.muteCallbacks.set(id, muteCallback)
  }

  unregister(id: string) {
    this.muteCallbacks.delete(id)
  }

  play(id: string) {
    this.muteCallbacks.forEach((stopAudio, registeredId) => {
      if (registeredId !== id) {
        stopAudio()
      }
    })
    this.currentPlayingId = id
  }

  mute(id: string) {
    if (this.currentPlayingId === id) {
      this.currentPlayingId = null
    }
  }
}

// Global singleton instance
export const audioManager = new AudioManager()
