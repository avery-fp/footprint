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

  it('honors start time from t= param (integer seconds)', async () => {
    const result = await resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120')
    expect(result.embedUrl).toContain('start=120')
    expect(result.rawMetadata).toMatchObject({ videoId: 'dQw4w9WgXcQ', start: 120 })
  })

  it('honors start time from t= param (duration format)', async () => {
    const result = await resolve('https://youtu.be/dQw4w9WgXcQ?t=1h2m30s')
    expect(result.embedUrl).toContain('start=3750')
  })

  it('honors start= param', async () => {
    const result = await resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45')
    expect(result.embedUrl).toContain('start=45')
  })

  it('omits start when no time param', async () => {
    const result = await resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(result.embedUrl).not.toContain('start=')
    expect(result.rawMetadata).toEqual({ videoId: 'dQw4w9WgXcQ' })
  })
})
