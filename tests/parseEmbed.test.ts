import { describe, it, expect } from 'vitest'
import { parseEmbed } from '@/lib/parseEmbed'

describe('parseEmbed', () => {
  // ── YouTube ──
  describe('YouTube', () => {
    it('parses standard watch URL', () => {
      const r = parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(r?.platform).toBe('youtube')
      expect(r?.embedUrl).toContain('youtube.com/embed/dQw4w9WgXcQ')
      expect(r?.embedUrl).toContain('controls=0')
    })

    it('parses youtu.be short URL', () => {
      const r = parseEmbed('https://youtu.be/dQw4w9WgXcQ')
      expect(r?.platform).toBe('youtube')
      expect(r?.embedUrl).toContain('dQw4w9WgXcQ')
    })

    it('parses YouTube Shorts', () => {
      const r = parseEmbed('https://youtube.com/shorts/abc123defgh')
      expect(r?.platform).toBe('youtube')
      expect(r?.embedUrl).toContain('abc123defgh')
    })

    it('strips branding params (controls=0)', () => {
      const r = parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(r!.embedUrl).toContain('controls=0')
    })
  })

  // ── Spotify ──
  describe('Spotify', () => {
    it('parses track URL', () => {
      const r = parseEmbed('https://open.spotify.com/track/abc123')
      expect(r?.platform).toBe('spotify')
      expect(r?.embedUrl).toContain('embed/track/abc123')
    })

    it('parses album URL', () => {
      const r = parseEmbed('https://open.spotify.com/album/xyz789')
      expect(r?.platform).toBe('spotify')
      expect(r?.embedUrl).toContain('embed/album/xyz789')
    })

    it('parses playlist URL', () => {
      const r = parseEmbed('https://open.spotify.com/playlist/def456')
      expect(r?.platform).toBe('spotify')
      expect(r?.embedUrl).toContain('embed/playlist/def456')
    })
  })

  // ── SoundCloud ──
  describe('SoundCloud', () => {
    it('parses track URL', () => {
      const r = parseEmbed('https://soundcloud.com/artist/track-name')
      expect(r?.platform).toBe('soundcloud')
      expect(r?.embedUrl).toContain('soundcloud.com/player')
    })
  })

  // ── Vimeo ──
  describe('Vimeo', () => {
    it('parses standard URL', () => {
      const r = parseEmbed('https://vimeo.com/123456789')
      expect(r?.platform).toBe('vimeo')
      expect(r?.embedUrl).toContain('player.vimeo.com/video/123456789')
    })

    it('strips branding params (badge=0, dnt=1)', () => {
      const r = parseEmbed('https://vimeo.com/123456789')
      expect(r?.embedUrl).toContain('badge=0')
      expect(r?.embedUrl).toContain('dnt=1')
    })
  })

  // ── Twitch ──
  describe('Twitch', () => {
    it('parses clip URL (clips.twitch.tv)', () => {
      const r = parseEmbed('https://clips.twitch.tv/FunnyClipSlug123')
      expect(r?.platform).toBe('twitch')
      expect(r?.embedUrl).toContain('clips.twitch.tv/embed')
      expect(r?.embedUrl).toContain('clip=FunnyClipSlug123')
      expect(r?.embedUrl).toContain('autoplay=false')
    })

    it('parses clip URL (twitch.tv/user/clip/slug)', () => {
      const r = parseEmbed('https://www.twitch.tv/streamer/clip/CoolClip456')
      expect(r?.platform).toBe('twitch')
      expect(r?.embedUrl).toContain('clip=CoolClip456')
    })

    it('parses video URL', () => {
      const r = parseEmbed('https://www.twitch.tv/videos/987654321')
      expect(r?.platform).toBe('twitch')
      expect(r?.embedUrl).toContain('player.twitch.tv')
      expect(r?.embedUrl).toContain('video=987654321')
      expect(r?.embedUrl).toContain('autoplay=false')
    })

    it('parses live channel URL', () => {
      const r = parseEmbed('https://www.twitch.tv/shroud')
      expect(r?.platform).toBe('twitch')
      expect(r?.embedUrl).toContain('channel=shroud')
    })

    it('returns tier 1', () => {
      const r = parseEmbed('https://www.twitch.tv/videos/123')
      expect(r?.tier).toBe(1)
    })

    it('returns 16/9 aspect ratio', () => {
      const r = parseEmbed('https://www.twitch.tv/shroud')
      expect(r?.aspectRatio).toBe('16/9')
    })
  })

  // ── Bandcamp ──
  describe('Bandcamp', () => {
    it('parses bandcamp URL', () => {
      const r = parseEmbed('https://artist.bandcamp.com/album/my-album')
      expect(r?.platform).toBe('bandcamp')
      expect(r?.tier).toBe(2)
    })
  })

  // ── No match ──
  describe('unknown URLs', () => {
    it('returns null for unknown URLs', () => {
      expect(parseEmbed('https://example.com/random-page')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseEmbed('')).toBeNull()
    })
  })
})
