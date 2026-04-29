export type MediaBody = 'portrait' | 'landscape' | 'square'

const LANDSCAPE_THRESHOLD = 1.2
const PORTRAIT_THRESHOLD = 0.8

export function classifyMediaBodyFromDimensions(
  width?: number | null,
  height?: number | null
): MediaBody | null {
  if (!width || !height || width <= 0 || height <= 0) return null

  const ratio = width / height
  if (ratio > LANDSCAPE_THRESHOLD) return 'landscape'
  if (ratio < PORTRAIT_THRESHOLD) return 'portrait'
  return 'square'
}

export function isYouTubeShortsUrl(url?: string | null): boolean {
  return !!url && /(?:youtube\.com\/shorts\/|youtu\.be\/shorts\/)/i.test(url)
}

export function classifyEmbedBody(input: {
  type?: string | null
  url?: string | null
  thumbnailWidth?: number | null
  thumbnailHeight?: number | null
  aspect?: string | null
}): MediaBody {
  const fromDimensions = classifyMediaBodyFromDimensions(input.thumbnailWidth, input.thumbnailHeight)
  if (fromDimensions) return fromDimensions

  if (input.aspect === 'portrait' || input.aspect === 'tall') return 'portrait'
  if (input.aspect === 'landscape' || input.aspect === 'wide') return 'landscape'

  if (input.type === 'tiktok') return 'portrait'
  if (input.type === 'youtube' && isYouTubeShortsUrl(input.url)) return 'portrait'
  if (input.type === 'youtube' || input.type === 'vimeo') return 'landscape'
  if (input.aspect === 'square') return 'square'
  return 'square'
}

export function bodyToAspectRatio(body: MediaBody): string {
  if (body === 'portrait') return '9 / 16'
  if (body === 'landscape') return '16 / 9'
  return '1 / 1'
}
