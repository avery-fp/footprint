import type { IdentifiedMedia } from '../types'
import { extractYouTubeId, getYouTubeThumbnail, buildYouTubeEmbedUrl } from '@/lib/parseEmbed'

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  const videoId = extractYouTubeId(url)
  if (!videoId) return { renderMode: 'preview_card' }

  // Identity-intake embedUrl is the dormant state — autoplay off, no controls UI leak.
  return {
    kind: 'video',
    provider: 'youtube',
    thumbnailUrl: getYouTubeThumbnail(url),
    embedUrl: buildYouTubeEmbedUrl(videoId, { autoplay: false, mute: false }),
    aspectRatio: '16/9',
    renderMode: 'embed',
    connectionRequired: false,
    rawMetadata: { videoId },
  }
}
