import { describe, expect, it } from 'vitest'
import { getYouTubeThumbnailCandidates } from '@/lib/media/thumbnails'

describe('YouTube thumbnail candidates', () => {
  it('prefers cached Footprint override thumbnails before raw YouTube URLs', () => {
    const candidates = getYouTubeThumbnailCandidates({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail_url_override: 'https://cdn.footprint.test/thumb.jpg',
      thumbnail_url_hq: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    })

    expect(candidates[0]).toBe('https://cdn.footprint.test/thumb.jpg')
    expect(candidates[1]).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg')
  })

  it('uses non-YouTube stored thumbnails before generated ytimg fallbacks', () => {
    const candidates = getYouTubeThumbnailCandidates({
      url: 'https://youtu.be/dQw4w9WgXcQ',
      thumbnail_url_hq: 'https://cdn.footprint.test/hq.jpg',
      thumbnail_url: 'https://cdn.footprint.test/thumb.jpg',
    })

    expect(candidates.slice(0, 2)).toEqual([
      'https://cdn.footprint.test/hq.jpg',
      'https://cdn.footprint.test/thumb.jpg',
    ])
  })
})
