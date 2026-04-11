import { describe, it, expect, vi } from 'vitest'
import { resolve } from '@/lib/media/providers/appleMusic'

describe('appleMusic adapter', () => {
  it('extracts title from URL slug when OG scrape fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')))

    const result = await resolve('https://music.apple.com/us/album/some-great-album/123456789')
    expect(result.kind).toBe('music')
    expect(result.provider).toBe('apple_music')
    expect(result.renderMode).toBe('preview_card')
    expect(result.title).toBe('Some Great Album')
    expect(result.connectionRequired).toBe(false)

    vi.unstubAllGlobals()
  })

  it('uses OG metadata when available', async () => {
    const mockHtml = `
      <html>
        <head>
          <meta property="og:title" content="Album Title" />
          <meta property="og:image" content="https://example.com/art.jpg" />
          <meta property="og:description" content="Artist Name" />
        </head>
      </html>
    `
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    }))

    const result = await resolve('https://music.apple.com/us/album/album-name/123456789')
    expect(result.title).toBe('Album Title')
    expect(result.thumbnailUrl).toBe('https://example.com/art.jpg')
    expect(result.authorName).toBe('Artist Name')

    vi.unstubAllGlobals()
  })

  it('stores content metadata in rawMetadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')))

    const result = await resolve('https://music.apple.com/us/album/my-album/123456789')
    expect(result.rawMetadata).toEqual({
      country: 'us',
      contentType: 'album',
      slug: 'my-album',
      albumId: '123456789',
    })

    vi.unstubAllGlobals()
  })

  it('returns Apple Music as fallback title for non-matching URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')))

    const result = await resolve('https://music.apple.com/us/browse')
    expect(result.title).toBe('Apple Music')

    vi.unstubAllGlobals()
  })
})
