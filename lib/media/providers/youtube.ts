import type { IdentifiedMedia } from '../types'
import { extractYouTubeId, getYouTubeThumbnail } from '@/lib/parseEmbed'

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const videoId = extractYouTubeId(url)
  if (!videoId) return { renderMode: 'preview_card' }

  return {
    kind: 'video',
    provider: 'youtube',
    thumbnailUrl: getYouTubeThumbnail(url),
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&fs=0&disablekb=1`,
    aspectRatio: '16/9',
    renderMode: 'embed',
    connectionRequired: false,
    rawMetadata: { videoId },
  }
}
