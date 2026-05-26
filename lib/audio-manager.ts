// Global audio spine for one-sound-at-a-time.
// Explicit playback invocation stops every other registered audio surface.

type AudioCallback = () => void
type NativeMediaElement = HTMLMediaElement & { volume: number; muted: boolean }

export const AUDIO_AUTHORITY = {
  nativeMediaVolume: 0.85,
  roomVolume: 0.35,
  roomDuckedVolume: 0.08,
  fadeMs: 220,
} as const

class AudioManager {
  private currentPlayingId: string | null = null
  private currentNativeId: string | null = null
  private currentProviderId: string | null = null
  private muteCallbacks: Map<string, AudioCallback> = new Map()
  private roomSources: Map<string, NativeMediaElement> = new Map()
  private fadeTimers: WeakMap<NativeMediaElement, ReturnType<typeof setInterval>> = new WeakMap()

  register(id: string, muteCallback: AudioCallback) {
    this.muteCallbacks.set(id, muteCallback)
  }

  unregister(id: string) {
    this.muteCallbacks.delete(id)
    if (this.currentPlayingId === id) this.currentPlayingId = null
    if (this.currentNativeId === id) this.currentNativeId = null
    if (this.currentProviderId === id) this.currentProviderId = null
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
    if (this.currentNativeId === id) {
      this.currentNativeId = null
      this.restoreRoom()
    }
    if (this.currentProviderId === id) {
      this.currentProviderId = null
      this.restoreRoom()
    }
  }

  playNative(id: string, media: NativeMediaElement, targetVolume = AUDIO_AUTHORITY.nativeMediaVolume) {
    this.play(id)
    this.currentNativeId = id
    this.currentProviderId = null
    this.duckRoom()
    media.muted = false
    media.volume = Math.min(Number.isFinite(media.volume) ? media.volume : 0, 0.08)
    this.fadeTo(media, targetVolume)
  }

  silenceNativeMedia(media: NativeMediaElement, pause = false) {
    this.fadeTo(media, 0, () => {
      media.muted = true
      if (pause) media.pause()
    })
  }

  activateProvider(id: string) {
    this.play(id)
    this.currentProviderId = id
    this.currentNativeId = null
    this.duckRoom()
  }

  release(id: string) {
    this.mute(id)
  }

  registerRoomSource(id: string, media: NativeMediaElement) {
    this.roomSources.set(id, media)
    media.volume = AUDIO_AUTHORITY.roomVolume
  }

  unregisterRoomSource(id: string) {
    this.roomSources.delete(id)
  }

  private duckRoom() {
    this.roomSources.forEach((media) => this.fadeTo(media, AUDIO_AUTHORITY.roomDuckedVolume))
  }

  private restoreRoom() {
    if (this.currentNativeId || this.currentProviderId) return
    this.roomSources.forEach((media) => this.fadeTo(media, AUDIO_AUTHORITY.roomVolume))
  }

  private fadeTo(media: NativeMediaElement, targetVolume: number, onDone?: () => void) {
    const target = Math.max(0, Math.min(1, targetVolume))
    const existing = this.fadeTimers.get(media)
    if (existing) clearInterval(existing)

    const start = Number.isFinite(media.volume) ? media.volume : target
    const startTime = Date.now()
    const duration = AUDIO_AUTHORITY.fadeMs

    if (duration <= 0 || Math.abs(start - target) < 0.01) {
      media.volume = target
      onDone?.()
      return
    }

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const t = Math.min(1, elapsed / duration)
      media.volume = start + (target - start) * t
      if (t >= 1) {
        clearInterval(timer)
        this.fadeTimers.delete(media)
        media.volume = target
        onDone?.()
      }
    }, 16)
    this.fadeTimers.set(media, timer)
  }

  _resetForTests() {
    this.currentPlayingId = null
    this.currentNativeId = null
    this.currentProviderId = null
    this.muteCallbacks.clear()
    this.roomSources.clear()
  }
}

// Global singleton instance
export const audioManager = new AudioManager()
