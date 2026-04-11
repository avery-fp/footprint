import type { VideoProvider } from '../video-provider'

let cached: VideoProvider | null = null

export function getVideoProvider(): VideoProvider {
  if (cached) return cached

  const provider = process.env.VIDEO_PROVIDER || 'mux'

  switch (provider) {
    case 'mux': {
      const { createMuxProvider } = require('./mux')
      cached = createMuxProvider()
      return cached!
    }
    default:
      throw new Error(
        `Unknown VIDEO_PROVIDER: "${provider}". Supported: mux`
      )
  }
}
