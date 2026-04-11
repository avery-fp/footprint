import { describe, it, expect } from 'vitest'
import { parseURL, getContentIcon, getContentBackground } from '@/lib/parser'

describe('parseURL', () => {
  describe('protocol validation (XSS prevention)', () => {
    it('blocks javascript: protocol', async () => {
      const result = await parseURL('javascript:alert(1)')
      expect(result.type).toBe('link')
      expect(result.embed_html).toBeNull()
    })

    it('blocks data: protocol', async () => {
      const result = await parseURL('data:text/html,<script>alert(1)</script>')
      expect(result.type).toBe('link')
      expect(result.embed_html).toBeNull()
    })

    it('allows https URLs', async () => {
      const result = await parseURL('https://example.com/image.jpg')
      expect(result.type).toBe('image')
      expect(result.url).toBe('https://example.com/image.jpg')
    })

    it('allows http URLs', async () => {
      const result = await parseURL('http://example.com/image.png')
      expect(result.type).toBe('image')
    })

    it('auto-prepends https to bare domains', async () => {
      const result = await parseURL('example.com/photo.jpg')
      expect(result.url).toBe('https://example.com/photo.jpg')
    })
  })

  describe('YouTube detection', () => {
    it('parses standard YouTube URL', async () => {
      const result = await parseURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result.type).toBe('youtube')
      expect(result.external_id).toBe('dQw4w9WgXcQ')
      expect(result.embed_html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    })

    it('parses youtu.be short URL', async () => {
      const result = await parseURL('https://youtu.be/dQw4w9WgXcQ')
      expect(result.type).toBe('youtube')
      expect(result.external_id).toBe('dQw4w9WgXcQ')
    })

    it('parses YouTube shorts', async () => {
      const result = await parseURL('https://youtube.com/shorts/abc123defgh')
      expect(result.type).toBe('youtube')
      expect(result.external_id).toBe('abc123defgh')
    })
  })

  describe('Spotify detection', () => {
    it('parses Spotify track URL', async () => {
      const result = await parseURL('https://open.spotify.com/track/abc123')
      expect(result.type).toBe('spotify')
      expect(result.external_id).toBe('abc123')
      expect(result.embed_html).toContain('spotify.com/embed/track/abc123')
    })

    it('parses Spotify album URL', async () => {
      const result = await parseURL('https://open.spotify.com/album/xyz789')
      expect(result.type).toBe('spotify')
      expect(result.embed_html).toContain('embed/album/xyz789')
    })
  })

  describe('Twitter/X detection', () => {
    it('parses twitter.com URL', async () => {
      const result = await parseURL('https://twitter.com/user/status/123456789')
      expect(result.type).toBe('twitter')
      expect(result.external_id).toBe('123456789')
    })

    it('parses x.com URL', async () => {
      const result = await parseURL('https://x.com/user/status/987654321')
      expect(result.type).toBe('twitter')
      expect(result.external_id).toBe('987654321')
    })
  })

  describe('image detection', () => {
    it('detects .jpg images', async () => {
      const result = await parseURL('https://example.com/photo.jpg')
      expect(result.type).toBe('image')
    })

    it('detects .webp images', async () => {
      const result = await parseURL('https://example.com/photo.webp')
      expect(result.type).toBe('image')
    })

    it('detects images with query params', async () => {
      const result = await parseURL('https://example.com/photo.png?w=800')
      expect(result.type).toBe('image')
    })

    it('escapes HTML in image embed', async () => {
      const result = await parseURL('https://example.com/photo"><script>.jpg')
      expect(result.embed_html).not.toContain('<script>')
      expect(result.embed_html).toContain('&gt;')
    })
  })

  describe('video detection', () => {
    it('detects .mp4 videos', async () => {
      const result = await parseURL('https://example.com/video.mp4')
      expect(result.type).toBe('video')
      expect(result.embed_html).toBeNull()
    })
  })

  describe('generic link fallback', () => {
    it('falls back to link for unknown URLs', async () => {
      const result = await parseURL('https://example.com/some-page')
      expect(result.type).toBe('link')
      expect(result.title).toBe('example.com')
    })
  })
})

describe('getContentIcon', () => {
  it('returns correct icons for known types', () => {
    expect(getContentIcon('youtube')).toBe('▶')
    expect(getContentIcon('spotify')).toBe('♫')
    expect(getContentIcon('twitter')).toBe('𝕏')
    expect(getContentIcon('image')).toBe('▣')
  })

  it('returns fallback for unknown type', () => {
    expect(getContentIcon('unknown' as any)).toBe('◎')
  })
})

describe('getContentBackground', () => {
  it('returns null for all types — brand gradients removed', () => {
    expect(getContentBackground('spotify')).toBeNull()
    expect(getContentBackground('soundcloud')).toBeNull()
    expect(getContentBackground('youtube')).toBeNull()
    expect(getContentBackground('link')).toBeNull()
  })
})
