import { describe, it, expect } from 'vitest'
import { normalizeLinkObject, sanitizeLinkMeta, getProviderName } from '@/lib/link-object'

// ════════════════════════════════════════
// normalizeLinkObject — renderKind routing
// ════════════════════════════════════════

describe('normalizeLinkObject renderKind', () => {
  it('Spotify track URL → music', () => {
    expect(normalizeLinkObject('https://open.spotify.com/track/abc123').renderKind).toBe('music')
  })

  it('Spotify album URL → music', () => {
    expect(normalizeLinkObject('https://open.spotify.com/album/xyz').renderKind).toBe('music')
  })

  it('Spotify playlist URL → music', () => {
    expect(normalizeLinkObject('https://open.spotify.com/playlist/abc').renderKind).toBe('music')
  })

  it('Apple Music URL → music', () => {
    expect(normalizeLinkObject('https://music.apple.com/us/album/thing/123').renderKind).toBe('music')
  })

  it('YouTube URL → video by default', () => {
    expect(normalizeLinkObject('https://www.youtube.com/watch?v=dQw4w9WgXcQ').renderKind).toBe('video')
  })

  it('youtu.be short URL → video by default', () => {
    expect(normalizeLinkObject('https://youtu.be/dQw4w9WgXcQ').renderKind).toBe('video')
  })

  it('YouTube URL with explicit music override → music', () => {
    expect(normalizeLinkObject('https://www.youtube.com/watch?v=abc', {}, 'music').renderKind).toBe('music')
  })

  it('YouTube URL with explicit artifact override → artifact', () => {
    expect(normalizeLinkObject('https://www.youtube.com/watch?v=abc', {}, 'artifact').renderKind).toBe('artifact')
  })

  it('Twitter URL → artifact', () => {
    expect(normalizeLinkObject('https://twitter.com/user/status/123').renderKind).toBe('artifact')
  })

  it('X.com URL → artifact', () => {
    expect(normalizeLinkObject('https://x.com/user/status/456').renderKind).toBe('artifact')
  })

  it('unknown URL → artifact', () => {
    expect(normalizeLinkObject('https://example.com/some-page').renderKind).toBe('artifact')
  })

  it('Substack URL → reader', () => {
    expect(normalizeLinkObject('https://somepublication.substack.com/p/article-title').renderKind).toBe('reader')
  })

  it('Medium article URL → reader', () => {
    expect(normalizeLinkObject('https://medium.com/@author/article-slug').renderKind).toBe('reader')
  })

  it('URL with /post/ path → reader', () => {
    expect(normalizeLinkObject('https://myblog.com/post/my-first-post').renderKind).toBe('reader')
  })

  it('Grailed root URL → artifact (not portal — no collection path)', () => {
    expect(normalizeLinkObject('https://www.grailed.com').renderKind).toBe('artifact')
  })

  it('Grailed product listing URL → artifact (not collection path)', () => {
    expect(normalizeLinkObject('https://www.grailed.com/listings/12345').renderKind).toBe('artifact')
  })

  it('Grailed /favorites URL → portal', () => {
    expect(normalizeLinkObject('https://www.grailed.com/username/favorites').renderKind).toBe('portal')
  })

  it('Letterboxd /watchlist URL → portal', () => {
    expect(normalizeLinkObject('https://letterboxd.com/username/watchlist').renderKind).toBe('portal')
  })

  it('overrideKind takes precedence over derived kind', () => {
    // Spotify is normally music, but override forces artifact
    const obj = normalizeLinkObject('https://open.spotify.com/track/abc', {}, 'artifact')
    expect(obj.renderKind).toBe('artifact')
  })
})

// ════════════════════════════════════════
// sanitizeLinkMeta — dignity guarantees
// ════════════════════════════════════════

describe('sanitizeLinkMeta', () => {
  it('valid title is returned trimmed', () => {
    const r = sanitizeLinkMeta({ title: '  My Song  ' }, 'https://example.com')
    expect(r.title).toBe('My Song')
  })

  it('null title falls back to domain for unknown provider', () => {
    const r = sanitizeLinkMeta({ title: null }, 'https://example.com/page')
    expect(r.title).toBe('example.com')
  })

  it('null title for Apple Music falls back to clean provider name, not raw domain', () => {
    const r = sanitizeLinkMeta({ title: null }, 'https://music.apple.com/us/album/x/1')
    expect(r.title).toBe('Apple Music')
  })

  it('null title for Substack falls back to clean provider name, not raw subdomain', () => {
    const r = sanitizeLinkMeta({ title: null }, 'https://blog.substack.com/p/article')
    expect(r.title).toBe('Substack')
  })

  it('null title for Spotify falls back to Spotify, not open.spotify.com', () => {
    const r = sanitizeLinkMeta({ title: null }, 'https://open.spotify.com/track/abc')
    expect(r.title).toBe('Spotify')
  })

  it('undefined title falls back to domain for unknown provider', () => {
    const r = sanitizeLinkMeta({}, 'https://example.com/page')
    expect(r.title).toBe('example.com')
  })

  it('whitespace-only title falls back to domain for unknown provider', () => {
    const r = sanitizeLinkMeta({ title: '   ' }, 'https://example.com/page')
    expect(r.title).toBe('example.com')
  })

  it('title is never undefined', () => {
    const r = sanitizeLinkMeta({}, 'not-a-valid-url')
    expect(r.title).toBeDefined()
    expect(typeof r.title).toBe('string')
    expect(r.title.length).toBeGreaterThan(0)
  })

  it('invalid URL falls back to "link" title', () => {
    const r = sanitizeLinkMeta({ title: null }, 'not-a-url')
    expect(r.title).toBe('link')
  })

  it('valid https image URL is returned', () => {
    const r = sanitizeLinkMeta({ image: 'https://cdn.example.com/img.jpg' }, 'https://example.com')
    expect(r.image).toBe('https://cdn.example.com/img.jpg')
  })

  it('valid http image URL is returned', () => {
    const r = sanitizeLinkMeta({ image: 'http://example.com/img.png' }, 'https://example.com')
    expect(r.image).toBe('http://example.com/img.png')
  })

  it('null image returns null', () => {
    const r = sanitizeLinkMeta({ image: null }, 'https://example.com')
    expect(r.image).toBeNull()
  })

  it('undefined image returns null', () => {
    const r = sanitizeLinkMeta({}, 'https://example.com')
    expect(r.image).toBeNull()
  })

  it('relative image path returns null', () => {
    const r = sanitizeLinkMeta({ image: '/img/photo.jpg' }, 'https://example.com')
    expect(r.image).toBeNull()
  })

  it('non-URL image string returns null', () => {
    const r = sanitizeLinkMeta({ image: 'not-a-url' }, 'https://example.com')
    expect(r.image).toBeNull()
  })

  it('empty image string returns null', () => {
    const r = sanitizeLinkMeta({ image: '' }, 'https://example.com')
    expect(r.image).toBeNull()
  })

  it('description is trimmed and returned', () => {
    const r = sanitizeLinkMeta({ description: '  Short excerpt.  ' }, 'https://example.com')
    expect(r.description).toBe('Short excerpt.')
  })

  it('null description returns null', () => {
    const r = sanitizeLinkMeta({ description: null }, 'https://example.com')
    expect(r.description).toBeNull()
  })

  it('empty description returns null', () => {
    const r = sanitizeLinkMeta({ description: '' }, 'https://example.com')
    expect(r.description).toBeNull()
  })

  it('author is preferred over creator', () => {
    const r = sanitizeLinkMeta({ author: 'Alice', creator: 'Bob' }, 'https://example.com')
    expect(r.creator).toBe('Alice')
  })

  it('creator is used when author is missing', () => {
    const r = sanitizeLinkMeta({ creator: 'Bob' }, 'https://example.com')
    expect(r.creator).toBe('Bob')
  })

  it('null creator and author returns null', () => {
    const r = sanitizeLinkMeta({ author: null, creator: null }, 'https://example.com')
    expect(r.creator).toBeNull()
  })

  it('provider is never empty', () => {
    const r = sanitizeLinkMeta({}, 'https://example.com')
    expect(r.provider).toBeTruthy()
    expect(typeof r.provider).toBe('string')
  })

  it('Spotify URL returns Spotify provider', () => {
    const r = sanitizeLinkMeta({}, 'https://open.spotify.com/track/abc')
    expect(r.provider).toBe('Spotify')
  })

  it('Apple Music URL returns Apple Music provider', () => {
    const r = sanitizeLinkMeta({}, 'https://music.apple.com/us/album/x/1')
    expect(r.provider).toBe('Apple Music')
  })

  it('Twitter URL returns X provider', () => {
    const r = sanitizeLinkMeta({}, 'https://twitter.com/user/status/123')
    expect(r.provider).toBe('X')
  })

  it('X.com URL returns X provider', () => {
    const r = sanitizeLinkMeta({}, 'https://x.com/user/status/123')
    expect(r.provider).toBe('X')
  })

  it('unknown URL returns domain as provider', () => {
    const r = sanitizeLinkMeta({}, 'https://mywebsite.io/post')
    expect(r.provider).toBe('mywebsite.io')
  })
})

// ════════════════════════════════════════
// normalizeLinkObject — full output shape
// ════════════════════════════════════════

describe('normalizeLinkObject output', () => {
  it('all fields are present and non-undefined', () => {
    const obj = normalizeLinkObject('https://example.com/article')
    expect(obj.sourceUrl).toBeDefined()
    expect(obj.provider).toBeDefined()
    expect(obj.renderKind).toBeDefined()
    expect(obj.title).toBeDefined()
    expect(obj.actionUrl).toBeDefined()
    expect(obj.confidence).toBeDefined()
    // creator, image, description are nullable — check they are not undefined
    expect(obj.creator === null || typeof obj.creator === 'string').toBe(true)
    expect(obj.image === null || typeof obj.image === 'string').toBe(true)
    expect(obj.description === null || typeof obj.description === 'string').toBe(true)
  })

  it('actionUrl equals sourceUrl', () => {
    const url = 'https://open.spotify.com/track/abc'
    const obj = normalizeLinkObject(url)
    expect(obj.actionUrl).toBe(url)
    expect(obj.sourceUrl).toBe(url)
  })

  it('music tiles have high confidence', () => {
    expect(normalizeLinkObject('https://open.spotify.com/track/abc').confidence).toBe('high')
  })

  it('artifact tiles have low confidence', () => {
    expect(normalizeLinkObject('https://example.com').confidence).toBe('low')
  })

  it('reader tiles have high confidence', () => {
    expect(normalizeLinkObject('https://blog.substack.com/p/article').confidence).toBe('high')
  })

  it('meta title is used when provided', () => {
    const obj = normalizeLinkObject('https://example.com', { title: 'My Article' })
    expect(obj.title).toBe('My Article')
  })

  it('meta image is used when valid', () => {
    const obj = normalizeLinkObject('https://example.com', { image: 'https://cdn.example.com/img.jpg' })
    expect(obj.image).toBe('https://cdn.example.com/img.jpg')
  })

  it('invalid meta image is omitted (null)', () => {
    const obj = normalizeLinkObject('https://example.com', { image: 'bad-url' })
    expect(obj.image).toBeNull()
  })
})
