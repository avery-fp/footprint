import { describe, expect, it } from 'vitest'

function getUploadedVideoPreload(isInView: boolean, isActivated: boolean) {
  return isActivated ? 'auto' : isInView ? 'metadata' : 'none'
}

function shouldShowUploadedVideoPoster(posterUrl: string | null, isPlaying: boolean) {
  return Boolean(posterUrl) && !isPlaying
}

describe('uploaded video playback surface', () => {
  it('does not eager preload when offscreen and idle', () => {
    expect(getUploadedVideoPreload(false, false)).toBe('none')
  })

  it('warms metadata when visible but not activated', () => {
    expect(getUploadedVideoPreload(true, false)).toBe('metadata')
  })

  it('upgrades to full preload after activation', () => {
    expect(getUploadedVideoPreload(true, true)).toBe('auto')
  })

  it('keeps poster visible until playback starts', () => {
    expect(shouldShowUploadedVideoPoster('https://cdn.example.com/poster.jpg', false)).toBe(true)
    expect(shouldShowUploadedVideoPoster('https://cdn.example.com/poster.jpg', true)).toBe(false)
  })
})
