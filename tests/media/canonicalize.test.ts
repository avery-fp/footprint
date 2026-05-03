import { describe, it, expect } from 'vitest'
import { canonicalizeUrl } from '@/lib/media/canonicalize'

describe('canonicalizeUrl', () => {
  describe('YouTube', () => {
    it('normalizes youtu.be to youtube.com/watch', () => {
      expect(canonicalizeUrl('https://youtu.be/dQw4w9WgXcQ', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('normalizes youtube.com/shorts to youtube.com/watch', () => {
      expect(canonicalizeUrl('https://youtube.com/shorts/dQw4w9WgXcQ', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('normalizes youtube.com/embed to youtube.com/watch', () => {
      expect(canonicalizeUrl('https://youtube.com/embed/dQw4w9WgXcQ', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('normalizes youtube.com/live to youtube.com/watch', () => {
      expect(canonicalizeUrl('https://youtube.com/live/dQw4w9WgXcQ', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('preserves standard youtube.com/watch URL', () => {
      expect(canonicalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('strips tracking params', () => {
      expect(canonicalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=share&si=abc', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('preserves start time from t= param', () => {
      expect(canonicalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120')
    })

    it('preserves start time from t= duration format', () => {
      expect(canonicalizeUrl('https://youtu.be/dQw4w9WgXcQ?t=2m30s', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=150')
    })

    it('drops t=0', () => {
      expect(canonicalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0', 'youtube'))
        .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })
  })

  describe('Twitter / X', () => {
    it('normalizes twitter.com to x.com', () => {
      expect(canonicalizeUrl('https://twitter.com/user/status/123', 'x'))
        .toBe('https://x.com/user/status/123')
    })

    it('preserves x.com URL', () => {
      expect(canonicalizeUrl('https://x.com/user/status/123', 'x'))
        .toBe('https://x.com/user/status/123')
    })

    it('strips tracking params', () => {
      expect(canonicalizeUrl('https://x.com/user/status/123?s=20&t=abc', 'x'))
        .toBe('https://x.com/user/status/123')
    })
  })

  describe('Spotify', () => {
    it('strips tracking params', () => {
      expect(canonicalizeUrl('https://open.spotify.com/track/abc123?si=xyz&utm_source=share', 'spotify'))
        .toBe('https://open.spotify.com/track/abc123')
    })

    it('preserves clean URL', () => {
      expect(canonicalizeUrl('https://open.spotify.com/album/xyz789', 'spotify'))
        .toBe('https://open.spotify.com/album/xyz789')
    })
  })

  describe('Apple Music', () => {
    it('strips tracking params but preserves track ID', () => {
      expect(canonicalizeUrl('https://music.apple.com/us/album/song/123?i=456&ls=1', 'apple_music'))
        .toBe('https://music.apple.com/us/album/song/123?i=456')
    })

    it('strips tracking params from album URL', () => {
      expect(canonicalizeUrl('https://music.apple.com/us/album/album-name/123?ls=1&app=music', 'apple_music'))
        .toBe('https://music.apple.com/us/album/album-name/123')
    })
  })

  describe('Generic', () => {
    it('strips UTM params', () => {
      expect(canonicalizeUrl('https://example.com/page?utm_source=share&utm_medium=web', 'generic'))
        .toBe('https://example.com/page')
    })

    it('strips trailing slash', () => {
      expect(canonicalizeUrl('https://example.com/page/', 'generic'))
        .toBe('https://example.com/page')
    })

    it('ensures https', () => {
      expect(canonicalizeUrl('http://example.com/page', 'generic'))
        .toBe('https://example.com/page')
    })

    it('preserves meaningful query params', () => {
      expect(canonicalizeUrl('https://example.com/page?id=123&view=detail', 'generic'))
        .toBe('https://example.com/page?id=123&view=detail')
    })
  })
})
