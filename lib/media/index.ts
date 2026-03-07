/**
 * MEDIA SUBSYSTEM — Barrel Export
 *
 * Re-exports everything from the media subsystem for clean imports:
 *   import { resolveMedia, resolveAspect, getGridClass } from '@/lib/media'
 */

// Unified resolver
export { resolveMedia, resolveMediaSync } from './resolveMedia'
export type { ResolvedMedia, MediaType } from './resolveMedia'

// Aspect + grid helpers
export {
  resolveAspect,
  isVideoTile,
  getGridClass,
  getGridClassHome,
  getAspectClass,
  getObjectFit,
  getImageSizes,
} from './aspect'

// Re-export existing modules for convenience
export { parseEmbed, extractYouTubeId, getYouTubeThumbnail } from '@/lib/parseEmbed'
export type { EmbedResult, EmbedPlatform } from '@/lib/parseEmbed'
export { mediaTypeFromUrl } from '@/lib/media'
