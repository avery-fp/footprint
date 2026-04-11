import { describe, it, expect } from 'vitest'
import { detectProvider } from '@/lib/media/detectProvider'

describe('detectProvider', () => {
  describe('YouTube', () => {
    it('detects youtube.com/watch', () => {
      expect(detectProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube')
    })

    it('detects youtu.be short URL', () => {
      expect(detectProvider('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    })

    it('detects youtube.com/shorts', () => {
      expect(detectProvider('https://youtube.com/shorts/abc123defgh')).toBe('youtube')
    })

    it('detects youtube.com/live', () => {
      expect(detectProvider('https://youtube.com/live/abc123defgh')).toBe('youtube')
    })

    it('detects youtube.com/embed', () => {
      expect(detectProvider('https://youtube.com/embed/abc123defgh')).toBe('youtube')
    })

    it('is case insensitive', () => {
      expect(detectProvider('https://www.YOUTUBE.COM/watch?v=abc123')).toBe('youtube')
    })
  })

  describe('TikTok', () => {
    it('detects tiktok.com video', () => {
      expect(detectProvider('https://www.tiktok.com/@user/video/1234567890')).toBe('tiktok')
    })

    it('detects vm.tiktok.com short URL', () => {
      expect(detectProvider('https://vm.tiktok.com/ZMxxxxxxx/')).toBe('tiktok')
    })
  })

  describe('Instagram', () => {
    it('detects instagram.com/p/ post', () => {
      expect(detectProvider('https://www.instagram.com/p/abc123/')).toBe('instagram')
    })

    it('detects instagram.com/reel/', () => {
      expect(detectProvider('https://www.instagram.com/reel/abc123/')).toBe('instagram')
    })
  })

  describe('Twitter / X', () => {
    it('detects twitter.com', () => {
      expect(detectProvider('https://twitter.com/user/status/123456789')).toBe('x')
    })

    it('detects x.com', () => {
      expect(detectProvider('https://x.com/user/status/123456789')).toBe('x')
    })
  })

  describe('Spotify', () => {
    it('detects spotify track', () => {
      expect(detectProvider('https://open.spotify.com/track/abc123')).toBe('spotify')
    })

    it('detects spotify album', () => {
      expect(detectProvider('https://open.spotify.com/album/xyz789')).toBe('spotify')
    })

    it('detects spotify playlist', () => {
      expect(detectProvider('https://open.spotify.com/playlist/abc123')).toBe('spotify')
    })
  })

  describe('Apple Music', () => {
    it('detects music.apple.com album', () => {
      expect(detectProvider('https://music.apple.com/us/album/some-album/123456789')).toBe('apple_music')
    })

    it('detects music.apple.com playlist', () => {
      expect(detectProvider('https://music.apple.com/us/playlist/some-playlist/pl.123')).toBe('apple_music')
    })

    it('detects music.apple.com song with track ID', () => {
      expect(detectProvider('https://music.apple.com/us/album/song-name/123?i=456')).toBe('apple_music')
    })
  })

  describe('SoundCloud', () => {
    it('detects soundcloud.com tracks', () => {
      expect(detectProvider('https://soundcloud.com/artist/track-name')).toBe('soundcloud')
    })
  })

  describe('Vimeo', () => {
    it('detects vimeo.com videos', () => {
      expect(detectProvider('https://vimeo.com/123456789')).toBe('vimeo')
    })
  })

  describe('Bandcamp', () => {
    it('detects bandcamp.com', () => {
      expect(detectProvider('https://artist.bandcamp.com/album/album-name')).toBe('bandcamp')
    })
  })

  describe('Generic fallback', () => {
    it('returns generic for unknown URLs', () => {
      expect(detectProvider('https://example.com/some-page')).toBe('generic')
    })

    it('returns generic for bare domains', () => {
      expect(detectProvider('https://google.com')).toBe('generic')
    })

    it('returns generic for empty string', () => {
      expect(detectProvider('')).toBe('generic')
    })
  })
})
