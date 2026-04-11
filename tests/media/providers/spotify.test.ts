import { describe, it, expect, vi } from 'vitest'
import { resolve } from '@/lib/media/providers/spotify'

describe('spotify adapter', () => {
  it('resolves spotify track URL with correct shape', async () => {
    // Mock fetch to avoid real network calls in tests
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')))

    const result = await resolve('https://open.spotify.com/track/abc123')
    expect(result.kind).toBe('music')
    expect(result.provider).toBe('spotify')
    expect(result.renderMode).toBe('preview_card')
    expect(result.embedUrl).toContain('spotify.com/embed/track/abc123')
    expect(result.title).toBe('Spotify track')
    expect(result.connectionRequired).toBe(false)
    expect(result.rawMetadata).toEqual({ spotifyId: 'abc123', contentType: 'track' })

    vi.unstubAllGlobals()
  })

  it('resolves spotify album URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')))

    const result = await resolve('https://open.spotify.com/album/xyz789')
    expect(result.renderMode).toBe('preview_card')
    expect(result.embedUrl).toContain('embed/album/xyz789')
    expect(result.rawMetadata).toEqual({ spotifyId: 'xyz789', contentType: 'album' })

    vi.unstubAllGlobals()
  })

  it('falls back to link_only for non-matching URL', async () => {
    const result = await resolve('https://open.spotify.com/user/profile')
    expect(result.renderMode).toBe('link_only')
  })

  it('uses oEmbed data when available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        title: 'Bohemian Rhapsody',
        thumbnail_url: 'https://i.scdn.co/image/abc',
        author_name: 'Queen',
      }),
    }))

    const result = await resolve('https://open.spotify.com/track/abc123')
    expect(result.title).toBe('Bohemian Rhapsody')
    expect(result.thumbnailUrl).toBe('https://i.scdn.co/image/abc')
    expect(result.authorName).toBe('Queen')

    vi.unstubAllGlobals()
  })
})
