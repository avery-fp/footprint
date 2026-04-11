/**
 * Media type detection — single source of truth.
 *
 * Checks `media_kind` column first (set by video provider lane),
 * falls back to URL extension for legacy rows.
 *
 * Used across all tile-mapping code to correctly label
 * uploaded videos vs images from the library table.
 */

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|3gp|3gpp|mkv)($|\?)/i

export function mediaTypeFromUrl(url: string, mediaKind?: string | null): 'video' | 'image' {
  if (mediaKind === 'video') return 'video'
  if (mediaKind === 'image') return 'image'
  return VIDEO_EXT.test(url) ? 'video' : 'image'
}
