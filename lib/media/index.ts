/**
 * MEDIA SUBSYSTEM — Barrel Export
 *
 * Re-exports everything from the media subsystem for clean imports:
 *   import { resolveMedia, resolveAspect, getGridClass } from '@/lib/media'
 *   import { identifyMedia, detectProvider } from '@/lib/media'
 */

// Legacy resolver (still used by existing consumers)
export { resolveMedia, resolveMediaSync } from './resolveMedia'
export type { ResolvedMedia, MediaType } from './resolveMedia'

// Identity intake layer (new system)
export { identifyMedia, identifyMediaSync } from './identify'
export type { IdentifiedMedia, MediaKind, MediaProvider, RenderMode } from './types'
export { detectProvider } from './detectProvider'
export { canonicalizeUrl } from './canonicalize'
export { isNewStyleRenderMode, PROVIDER_RENDER_DEFAULTS, contentTypeToKind, contentTypeToProvider } from './types'

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
