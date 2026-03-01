/**
 * Media type detection from URL extension.
 * Used across all tile-mapping code to correctly label
 * uploaded videos vs images from the library table.
 */

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)($|\?)/i

export function mediaTypeFromUrl(url: string): "video" | "image" {
  return VIDEO_EXT.test(url) ? "video" : "image"
}
