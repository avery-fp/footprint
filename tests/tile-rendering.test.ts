import { describe, it, expect } from 'vitest'
import { resolveCanonicalType, canRenderPublicTile } from '@/lib/tile-rendering'

// ════════════════════════════════════════
// resolveCanonicalType
// ════════════════════════════════════════

describe('resolveCanonicalType', () => {
  // ── Video detection ──

  it('.mp4 URL resolves to video', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.mp4')).toBe('video')
  })

  it('.mov URL resolves to video', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.mov')).toBe('video')
  })

  it('.webm URL resolves to video', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.webm')).toBe('video')
  })

  it('.m4v URL resolves to video', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.m4v')).toBe('video')
  })

  it('media_kind=video overrides URL extension', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.jpg', 'video')).toBe('video')
  })

  it('extensionless URL defaults to image even with stored type=video', () => {
    // mediaTypeFromUrl returns 'image' for extensionless URLs, which takes priority
    // over stored type. This is correct — ambiguous URLs should not auto-play as video.
    expect(resolveCanonicalType('video', 'https://storage.example.com/media/12345')).toBe('image')
  })

  // ── Image detection ──

  it('.jpg URL resolves to image', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.jpg')).toBe('image')
  })

  it('.png URL resolves to image', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.png')).toBe('image')
  })

  it('.webp URL resolves to image', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.webp')).toBe('image')
  })

  it('.gif URL resolves to image', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.gif')).toBe('image')
  })

  it('.heic URL resolves to image', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.heic')).toBe('image')
  })

  it('media_kind=image overrides stored type', () => {
    expect(resolveCanonicalType('video', 'https://storage.example.com/file', 'image')).toBe('image')
  })

  it('stored type=image is fallback for unknown URL', () => {
    expect(resolveCanonicalType('image', 'https://example.com/something')).toBe('image')
  })

  // ── Thought detection ──

  it('type=thought always resolves to thought', () => {
    expect(resolveCanonicalType('thought', '')).toBe('thought')
  })

  it('type=thought ignores URL content', () => {
    expect(resolveCanonicalType('thought', 'https://youtube.com/watch?v=123')).toBe('thought')
  })

  // ── Content / embed detection ──

  it('YouTube URL resolves to content (not video)', () => {
    expect(resolveCanonicalType('youtube', 'https://www.youtube.com/watch?v=abc')).toBe('content')
  })

  it('youtu.be short URL resolves to content', () => {
    expect(resolveCanonicalType('youtube', 'https://youtu.be/abc')).toBe('content')
  })

  it('Spotify URL resolves to content', () => {
    expect(resolveCanonicalType('spotify', 'https://open.spotify.com/track/abc')).toBe('content')
  })

  it('Vimeo URL resolves to content', () => {
    expect(resolveCanonicalType('vimeo', 'https://vimeo.com/12345')).toBe('content')
  })

  it('SoundCloud URL resolves to content', () => {
    expect(resolveCanonicalType('soundcloud', 'https://soundcloud.com/artist/track')).toBe('content')
  })

  it('Bandcamp URL resolves to content', () => {
    expect(resolveCanonicalType('link', 'https://artist.bandcamp.com/album/thing')).toBe('content')
  })

  it('Twitter URL resolves to content (sealed from TileImage branch)', () => {
    expect(resolveCanonicalType('twitter', 'https://twitter.com/user/status/123')).toBe('content')
  })

  it('X.com URL resolves to content', () => {
    expect(resolveCanonicalType('link', 'https://x.com/user/status/456')).toBe('content')
  })

  it('pic.twitter.com URL resolves to content', () => {
    expect(resolveCanonicalType('link', 'https://pic.twitter.com/P4SpIrsXtO')).toBe('content')
  })

  it('generic URL with type=link resolves to image (mediaTypeFromUrl default)', () => {
    // mediaTypeFromUrl returns 'image' for non-video URLs, which fires before
    // the 'content' fallback. In UnifiedTile, these reach the image branch,
    // then fall through to ContentCard via the url/thumbnail/embed check.
    expect(resolveCanonicalType('link', 'https://example.com/article')).toBe('image')
  })

  it('empty URL with type=link resolves to image (mediaTypeFromUrl default)', () => {
    expect(resolveCanonicalType('link', '')).toBe('image')
  })

  // ── Critical regression: .mp4 must never resolve to content ──

  it('REGRESSION: .mp4 with type=image resolves to video, not content', () => {
    const result = resolveCanonicalType('image', 'https://supabase.co/storage/v1/object/public/content/1001/test.mp4')
    expect(result).toBe('video')
    expect(result).not.toBe('content')
  })

  it('REGRESSION: .mp4 with type=video resolves to video, not content', () => {
    const result = resolveCanonicalType('video', 'https://supabase.co/storage/v1/object/public/content/1001/test.mp4')
    expect(result).toBe('video')
    expect(result).not.toBe('content')
  })

  // ── URL with query params ──

  it('.mp4 with query params still resolves to video', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.mp4?width=800&quality=80')).toBe('video')
  })

  it('.jpg with query params still resolves to image', () => {
    expect(resolveCanonicalType('image', 'https://storage.example.com/file.jpg?width=800&quality=80')).toBe('image')
  })
})

// ════════════════════════════════════════
// canRenderPublicTile
// ════════════════════════════════════════

function makeTile(overrides: Partial<Parameters<typeof canRenderPublicTile>[0]> = {}): Parameters<typeof canRenderPublicTile>[0] {
  return {
    type: 'image',
    url: 'https://storage.example.com/photo.jpg',
    title: null,
    thumbnail_url: null,
    embed_html: null,
    ...overrides,
  }
}

describe('canRenderPublicTile', () => {
  // ── Image tiles ──

  it('image tile with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'image', url: 'https://example.com/photo.jpg' }))).toBe(true)
  })

  it('image tile without URL is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'image', url: '' }))).toBe(false)
  })

  // ── Video tiles ──

  it('video tile with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'video', url: 'https://example.com/clip.mp4' }))).toBe(true)
  })

  it('video tile without URL is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'video', url: '' }))).toBe(false)
  })

  it('.mp4 URL with type=image is renderable (detected as video)', () => {
    expect(canRenderPublicTile(makeTile({ type: 'image', url: 'https://example.com/clip.mp4' }))).toBe(true)
  })

  it('.mov URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'image', url: 'https://example.com/clip.mov' }))).toBe(true)
  })

  // ── Thought tiles ──

  it('thought tile with title is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'thought', url: '', title: 'Hello world' }))).toBe(true)
  })

  it('thought tile with empty title is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'thought', url: '', title: '' }))).toBe(false)
  })

  it('thought tile with whitespace-only title is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'thought', url: '', title: '   ' }))).toBe(false)
  })

  it('thought tile with null title is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'thought', url: '', title: null }))).toBe(false)
  })

  // ── Container tiles ──

  it('container tile is always renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'container', url: '' }))).toBe(true)
  })

  it('container tile without URL is still renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'container', url: '', title: null, thumbnail_url: null }))).toBe(true)
  })

  // ── Payment/CTA tiles ──

  it('payment type is always renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'payment', url: '' }))).toBe(true)
  })

  it('Stripe buy link is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'link', url: 'https://buy.stripe.com/abc123' }))).toBe(true)
  })

  it('Stripe checkout link is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'link', url: 'https://checkout.stripe.com/abc' }))).toBe(true)
  })

  // ── Content tiles (YouTube, Spotify, links) ──

  it('YouTube tile with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'youtube', url: 'https://www.youtube.com/watch?v=abc' }))).toBe(true)
  })

  it('Spotify tile with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'spotify', url: 'https://open.spotify.com/track/abc' }))).toBe(true)
  })

  it('link tile with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'link', url: 'https://example.com' }))).toBe(true)
  })

  it('content tile with only thumbnail is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'youtube', url: '', thumbnail_url: 'https://img.youtube.com/vi/abc/0.jpg' }))).toBe(true)
  })

  it('content tile with only embed_html is renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'link', url: '', embed_html: '<iframe src="..."></iframe>' }))).toBe(true)
  })

  // ── RenderMode-driven tiles ──

  it('render_mode=native_video with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'native_video', url: 'https://example.com/video.mp4' }))).toBe(true)
  })

  it('render_mode=native_video without URL is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'native_video', url: '' }))).toBe(false)
  })

  it('render_mode=embed with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'embed', url: 'https://example.com' }))).toBe(true)
  })

  it('render_mode=embed with only embed_html is renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'embed', url: '', embed_html: '<iframe />' }))).toBe(true)
  })

  it('render_mode=preview_card with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'preview_card', url: 'https://example.com' }))).toBe(true)
  })

  it('render_mode=preview_card without URL is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'preview_card', url: '' }))).toBe(false)
  })

  it('render_mode=ghost with URL is renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'ghost', url: 'https://youtube.com/watch?v=abc' }))).toBe(true)
  })

  it('render_mode=ghost without URL is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ render_mode: 'ghost', url: '' }))).toBe(false)
  })

  // ── Unrenderable tiles ──

  it('unknown type with no URL/thumbnail/embed is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'unknown', url: '', title: null, thumbnail_url: null, embed_html: null }))).toBe(false)
  })

  it('tile with all null/empty fields is NOT renderable', () => {
    expect(canRenderPublicTile({
      type: '',
      url: '',
      title: null,
      thumbnail_url: null,
      embed_html: null,
    })).toBe(false)
  })

  // ── Critical regression: video with missing URL must not be renderable ──

  it('REGRESSION: video type with empty URL is NOT renderable', () => {
    expect(canRenderPublicTile(makeTile({ type: 'video', url: '' }))).toBe(false)
  })

  it('REGRESSION: .mp4 URL is renderable regardless of stored type', () => {
    expect(canRenderPublicTile(makeTile({ type: 'link', url: 'https://example.com/file.mp4' }))).toBe(true)
  })
})
