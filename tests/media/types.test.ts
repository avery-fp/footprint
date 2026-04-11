import { describe, it, expect } from 'vitest'
import {
  contentTypeToKind,
  contentTypeToProvider,
  renderModeFromLegacy,
  isNewStyleRenderMode,
  PROVIDER_RENDER_DEFAULTS,
} from '@/lib/media/types'
import type {
  MediaKind,
  MediaProvider,
  RenderMode,
  IdentifiedMedia,
} from '@/lib/media/types'

describe('contentTypeToKind', () => {
  it('maps youtube to video', () => {
    expect(contentTypeToKind('youtube')).toBe('video')
  })

  it('maps vimeo to video', () => {
    expect(contentTypeToKind('vimeo')).toBe('video')
  })

  it('maps video to video', () => {
    expect(contentTypeToKind('video')).toBe('video')
  })

  it('maps spotify to music', () => {
    expect(contentTypeToKind('spotify')).toBe('music')
  })

  it('maps soundcloud to music', () => {
    expect(contentTypeToKind('soundcloud')).toBe('music')
  })

  it('maps twitter to social', () => {
    expect(contentTypeToKind('twitter')).toBe('social')
  })

  it('maps instagram to social', () => {
    expect(contentTypeToKind('instagram')).toBe('social')
  })

  it('maps tiktok to social', () => {
    expect(contentTypeToKind('tiktok')).toBe('social')
  })

  it('maps image to image', () => {
    expect(contentTypeToKind('image')).toBe('image')
  })

  it('maps link to link', () => {
    expect(contentTypeToKind('link')).toBe('link')
  })

  it('maps thought to link', () => {
    expect(contentTypeToKind('thought')).toBe('link')
  })

  it('maps payment to link', () => {
    expect(contentTypeToKind('payment')).toBe('link')
  })

  it('maps unknown values to link', () => {
    expect(contentTypeToKind('unknown' as any)).toBe('link')
  })
})

describe('contentTypeToProvider', () => {
  it('maps youtube to youtube', () => {
    expect(contentTypeToProvider('youtube')).toBe('youtube')
  })

  it('maps spotify to spotify', () => {
    expect(contentTypeToProvider('spotify')).toBe('spotify')
  })

  it('maps twitter to x', () => {
    expect(contentTypeToProvider('twitter')).toBe('x')
  })

  it('maps instagram to instagram', () => {
    expect(contentTypeToProvider('instagram')).toBe('instagram')
  })

  it('maps tiktok to tiktok', () => {
    expect(contentTypeToProvider('tiktok')).toBe('tiktok')
  })

  it('maps vimeo to vimeo', () => {
    expect(contentTypeToProvider('vimeo')).toBe('vimeo')
  })

  it('maps soundcloud to soundcloud', () => {
    expect(contentTypeToProvider('soundcloud')).toBe('soundcloud')
  })

  it('maps video to uploaded_video', () => {
    expect(contentTypeToProvider('video')).toBe('uploaded_video')
  })

  it('maps image to generic', () => {
    expect(contentTypeToProvider('image')).toBe('generic')
  })

  it('maps link to generic', () => {
    expect(contentTypeToProvider('link')).toBe('generic')
  })

  it('maps unknown values to generic', () => {
    expect(contentTypeToProvider('unknown' as any)).toBe('generic')
  })
})

describe('renderModeFromLegacy', () => {
  it('maps ghost youtube to embed', () => {
    expect(renderModeFromLegacy('youtube', 'ghost')).toBe('embed')
  })

  it('maps ghost spotify to preview_card', () => {
    expect(renderModeFromLegacy('spotify', 'ghost')).toBe('preview_card')
  })

  it('maps ghost twitter to preview_card', () => {
    expect(renderModeFromLegacy('twitter', 'ghost')).toBe('preview_card')
  })

  it('maps ghost tiktok to preview_card', () => {
    expect(renderModeFromLegacy('tiktok', 'ghost')).toBe('preview_card')
  })

  it('maps ghost instagram to preview_card', () => {
    expect(renderModeFromLegacy('instagram', 'ghost')).toBe('preview_card')
  })

  it('maps legacy embed to embed', () => {
    expect(renderModeFromLegacy('youtube', 'embed')).toBe('embed')
  })

  it('maps video type to native_video', () => {
    expect(renderModeFromLegacy('video', 'embed')).toBe('native_video')
  })

  it('maps unknown platform to link_only', () => {
    expect(renderModeFromLegacy('link', 'embed')).toBe('link_only')
  })
})

describe('isNewStyleRenderMode', () => {
  it('returns true for preview_card', () => {
    expect(isNewStyleRenderMode('preview_card')).toBe(true)
  })

  it('returns true for native_video', () => {
    expect(isNewStyleRenderMode('native_video')).toBe(true)
  })

  it('returns true for native_music', () => {
    expect(isNewStyleRenderMode('native_music')).toBe(true)
  })

  it('returns true for link_only', () => {
    expect(isNewStyleRenderMode('link_only')).toBe(true)
  })

  it('returns false for legacy ghost', () => {
    expect(isNewStyleRenderMode('ghost')).toBe(false)
  })

  it('returns false for legacy embed (without metadata.provider)', () => {
    expect(isNewStyleRenderMode('embed')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isNewStyleRenderMode(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isNewStyleRenderMode('')).toBe(false)
  })
})

describe('PROVIDER_RENDER_DEFAULTS', () => {
  it('has defaults for every MediaProvider', () => {
    const providers: MediaProvider[] = [
      'youtube', 'tiktok', 'instagram', 'x', 'spotify',
      'apple_music', 'soundcloud', 'vimeo', 'bandcamp',
      'uploaded_video', 'generic',
    ]
    for (const p of providers) {
      expect(PROVIDER_RENDER_DEFAULTS[p]).toBeDefined()
      expect(PROVIDER_RENDER_DEFAULTS[p].preferredMode).toBeDefined()
      expect(PROVIDER_RENDER_DEFAULTS[p].fallbackMode).toBeDefined()
    }
  })

  it('maps youtube preferred to embed', () => {
    expect(PROVIDER_RENDER_DEFAULTS.youtube.preferredMode).toBe('embed')
  })

  it('maps spotify preferred to preview_card', () => {
    expect(PROVIDER_RENDER_DEFAULTS.spotify.preferredMode).toBe('preview_card')
  })

  it('maps apple_music preferred to preview_card', () => {
    expect(PROVIDER_RENDER_DEFAULTS.apple_music.preferredMode).toBe('preview_card')
  })

  it('maps uploaded_video preferred to native_video', () => {
    expect(PROVIDER_RENDER_DEFAULTS.uploaded_video.preferredMode).toBe('native_video')
  })

  it('maps generic fallback to link_only', () => {
    expect(PROVIDER_RENDER_DEFAULTS.generic.fallbackMode).toBe('link_only')
  })
})

describe('IdentifiedMedia type', () => {
  it('can construct a valid IdentifiedMedia object', () => {
    const media: IdentifiedMedia = {
      kind: 'video',
      provider: 'youtube',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      subtitle: null,
      authorName: 'Rick Astley',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      posterUrl: null,
      embedHtml: null,
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      playbackUrl: null,
      durationMs: null,
      aspectRatio: '16/9',
      renderMode: 'embed',
      connectionRequired: false,
      rawMetadata: {},
    }
    expect(media.kind).toBe('video')
    expect(media.provider).toBe('youtube')
    expect(media.renderMode).toBe('embed')
  })
})
