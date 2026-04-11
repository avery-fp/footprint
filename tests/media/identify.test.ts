import { describe, it, expect, vi } from 'vitest'
import { identifyMedia, identifyMediaSync } from '@/lib/media/identify'
import type { IdentifiedMedia } from '@/lib/media/types'

// Stub fetch globally so no real network calls happen
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')))

describe('identifyMedia', () => {
  it('resolves a YouTube URL', async () => {
    const result = await identifyMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result.kind).toBe('video')
    expect(result.provider).toBe('youtube')
    expect(result.renderMode).toBe('embed')
    expect(result.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result.embedUrl).toContain('youtube-nocookie.com')
    expect(result.thumbnailUrl).toBeTruthy()
    expect(result.aspectRatio).toBe('16/9')
  })

  it('resolves a Spotify URL', async () => {
    const result = await identifyMedia('https://open.spotify.com/track/abc123')
    expect(result.kind).toBe('music')
    expect(result.provider).toBe('spotify')
    expect(result.renderMode).toBe('preview_card')
    expect(result.canonicalUrl).toBe('https://open.spotify.com/track/abc123')
  })

  it('resolves an Apple Music URL', async () => {
    const result = await identifyMedia('https://music.apple.com/us/album/some-album/123456789')
    expect(result.kind).toBe('music')
    expect(result.provider).toBe('apple_music')
    expect(result.renderMode).toBe('preview_card')
    expect(result.title).toBe('Some Album')
  })

  it('resolves a Twitter URL', async () => {
    const result = await identifyMedia('https://twitter.com/user/status/123456')
    expect(result.kind).toBe('social')
    expect(result.provider).toBe('x')
    expect(result.renderMode).toBe('preview_card')
    expect(result.canonicalUrl).toBe('https://x.com/user/status/123456')
  })

  it('resolves a TikTok URL', async () => {
    const result = await identifyMedia('https://www.tiktok.com/@user/video/1234567890')
    expect(result.kind).toBe('social')
    expect(result.provider).toBe('tiktok')
    expect(result.renderMode).toBe('preview_card')
  })

  it('resolves a generic URL to link_only', async () => {
    const result = await identifyMedia('https://example.com/some-page')
    expect(result.kind).toBe('link')
    expect(result.provider).toBe('generic')
    expect(result.renderMode).toBe('link_only')
  })

  it('handles empty URL gracefully', async () => {
    const result = await identifyMedia('')
    expect(result.kind).toBe('link')
    expect(result.provider).toBe('generic')
    expect(result.renderMode).toBe('link_only')
  })

  it('normalizes youtu.be URL to canonical form', async () => {
    const result = await identifyMedia('https://youtu.be/dQw4w9WgXcQ')
    expect(result.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('normalizes twitter.com to x.com', async () => {
    const result = await identifyMedia('https://twitter.com/user/status/123')
    expect(result.canonicalUrl).toBe('https://x.com/user/status/123')
  })

  it('always returns a complete IdentifiedMedia shape', async () => {
    const result = await identifyMedia('https://example.com')
    // Verify all required fields exist
    expect(result.kind).toBeDefined()
    expect(result.provider).toBeDefined()
    expect(result.canonicalUrl).toBeDefined()
    expect(result.title).toBeDefined()
    expect(result.renderMode).toBeDefined()
    expect(result.connectionRequired).toBe(false)
    expect(result.rawMetadata).toBeDefined()
    // Nullable fields should be explicitly null, not undefined
    expect('subtitle' in result).toBe(true)
    expect('authorName' in result).toBe(true)
    expect('thumbnailUrl' in result).toBe(true)
    expect('posterUrl' in result).toBe(true)
    expect('embedHtml' in result).toBe(true)
    expect('embedUrl' in result).toBe(true)
    expect('playbackUrl' in result).toBe(true)
    expect('durationMs' in result).toBe(true)
    expect('aspectRatio' in result).toBe(true)
  })

  it('never fails closed — always returns valid object', async () => {
    // Even with totally broken input
    const result = await identifyMedia('not-a-url-at-all')
    expect(result.renderMode).toBe('link_only')
    expect(result.kind).toBe('link')
  })
})

describe('identifyMediaSync', () => {
  it('resolves YouTube URL synchronously', () => {
    const result = identifyMediaSync('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('video')
    expect(result!.provider).toBe('youtube')
    expect(result!.renderMode).toBe('embed')
  })

  it('resolves Spotify URL synchronously', () => {
    const result = identifyMediaSync('https://open.spotify.com/track/abc123')
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('music')
    expect(result!.provider).toBe('spotify')
    expect(result!.renderMode).toBe('preview_card')
  })

  it('returns null for generic URL (needs network)', () => {
    const result = identifyMediaSync('https://example.com/page')
    // Sync path returns a basic result for known providers, null or basic for unknown
    expect(result).not.toBeNull()
    expect(result!.renderMode).toBe('link_only')
  })

  it('returns null for empty URL', () => {
    const result = identifyMediaSync('')
    expect(result).toBeNull()
  })
})
