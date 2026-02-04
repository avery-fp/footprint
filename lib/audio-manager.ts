// Global audio manager for one-sound-at-a-time
// When a video/YouTube is unmuted, all others mute automatically

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
    // If another video is playing, mute it first
    if (this.currentPlayingId && this.currentPlayingId !== id) {
      const muteCallback = this.muteCallbacks.get(this.currentPlayingId)
      if (muteCallback) {
        muteCallback()
      }
    }
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
