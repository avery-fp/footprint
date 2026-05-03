import type { IdentifiedMedia } from '../types'
import { extractYouTubeId, extractYouTubeStart, getYouTubeThumbnail, buildYouTubeEmbedUrl } from '@/lib/parseEmbed'

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const videoId = extractYouTubeId(url)
  if (!videoId) return { renderMode: 'preview_card' }

  const start = extractYouTubeStart(url)

  // Identity-intake embedUrl is the dormant state — autoplay off, no controls UI leak.
  return {
    kind: 'video',
    provider: 'youtube',
    thumbnailUrl: getYouTubeThumbnail(url),
    embedUrl: buildYouTubeEmbedUrl(videoId, { autoplay: false, mute: false, start }),
    aspectRatio: '16/9',
    renderMode: 'embed',
    connectionRequired: false,
    rawMetadata: { videoId, ...(start > 0 ? { start } : {}) },
  }
}
