import { describe, it, expect } from 'vitest'
import { resolve } from '@/lib/media/providers/youtube'

describe('youtube adapter', () => {
  it('resolves standard youtube URL', async () => {
    const result = await resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result.kind).toBe('video')
    expect(result.provider).toBe('youtube')
    expect(result.renderMode).toBe('embed')
    expect(result.embedUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(result.thumbnailUrl).toContain('dQw4w9WgXcQ')
    expect(result.aspectRatio).toBe('16/9')
    expect(result.connectionRequired).toBe(false)
  })

  it('resolves youtu.be short URL', async () => {
    const result = await resolve('https://youtu.be/dQw4w9WgXcQ')
    expect(result.renderMode).toBe('embed')
    expect(result.embedUrl).toContain('dQw4w9WgXcQ')
  })

  it('resolves youtube shorts', async () => {
    const result = await resolve('https://youtube.com/shorts/abc123defgh')
    expect(result.renderMode).toBe('embed')
    expect(result.embedUrl).toContain('abc123defgh')
  })

  it('falls back to preview_card for invalid URL', async () => {
    const result = await resolve('https://youtube.com/channel/whatever')
    expect(result.renderMode).toBe('preview_card')
  })

  it('includes videoId in rawMetadata', async () => {
    const result = await resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result.rawMetadata).toEqual({ videoId: 'dQw4w9WgXcQ' })
  })
})
