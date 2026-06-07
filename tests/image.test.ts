import { describe, expect, it } from 'vitest'
import { getPublicImageUrl } from '@/lib/image'

describe('getPublicImageUrl', () => {
  it('converts Supabase public object images to render image URLs', () => {
    expect(getPublicImageUrl('https://example.supabase.co/storage/v1/object/public/content/1001/photo.jpg')).toBe(
      'https://example.supabase.co/storage/v1/render/image/public/content/1001/photo.jpg?width=720&quality=70&format=webp'
    )
  })

  it('normalizes existing Supabase render image URLs', () => {
    expect(getPublicImageUrl('https://example.supabase.co/storage/v1/render/image/public/content/1001/photo.png?width=1600&quality=95')).toBe(
      'https://example.supabase.co/storage/v1/render/image/public/content/1001/photo.png?width=720&quality=70&format=webp'
    )
  })

  it('uses caller-provided width, quality, and format', () => {
    expect(getPublicImageUrl('https://example.supabase.co/storage/v1/object/public/content/1001/photo.jpeg', { width: 960, quality: 75, format: 'avif' })).toBe(
      'https://example.supabase.co/storage/v1/render/image/public/content/1001/photo.jpeg?width=960&quality=75&format=avif'
    )
  })

  it('leaves video URLs unchanged', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/content/1001/movie.mov'
    expect(getPublicImageUrl(url)).toBe(url)
  })

  it('leaves audio URLs unchanged', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/content/1001/song.mp3'
    expect(getPublicImageUrl(url)).toBe(url)
  })

  it('leaves YouTube thumbnail URLs unchanged', () => {
    const url = 'https://img.youtube.com/vi/abc123/maxresdefault.jpg'
    expect(getPublicImageUrl(url)).toBe(url)
  })

  it('leaves arbitrary external URLs unchanged', () => {
    const url = 'https://cdn.example.com/images/photo.jpg'
    expect(getPublicImageUrl(url)).toBe(url)
  })

  it('leaves non-Supabase URLs unchanged', () => {
    const url = '/local/photo.jpg'
    expect(getPublicImageUrl(url)).toBe(url)
  })
})
