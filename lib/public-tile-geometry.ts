import { tileAspectRatio } from '@/lib/grid-layouts'
import { transformImageUrl } from '@/lib/image'
import { getGridClass, isVideoTile, resolveAspect } from '@/lib/media/aspect'
import { getYouTubeThumbnailCandidates } from '@/lib/media/thumbnails'
import { extractYouTubeId } from '@/lib/parseEmbed'

export interface PublicTileGeometry {
  resolvedAspect: string
  gridClass: string
  fitClass: string
  aspectCss: string
  posterUrl: string | null
  railHeightMobile: string
  railHeightDesktop: string
  viewportFitHeight: string
}

function publicAspectCss(item: any): string {
  const isSpotify = item.type === 'spotify' || /open\.spotify\.com/i.test(item.url || '')
  const isAppleMusic = item.type === 'apple_music' || /music\.apple\.com/i.test(item.url || '')
  const isOtherMusic = item.type === 'soundcloud' || item.type === 'bandcamp' ||
    /(?:soundcloud\.com|\.bandcamp\.com\/(?:album|track)\/)/i.test(item.url || '')

  if (isSpotify) {
    if (item.aspect === 'square') return '1 / 1'
    return '9 / 2'
  }

  if (isAppleMusic) {
    return item.aspect === 'wide' || item.aspect === 'landscape' ? '9 / 2' : '1 / 1'
  }

  if (isOtherMusic) {
    return item.aspect === 'wide' || item.aspect === 'landscape' ? '9 / 2' : '1 / 1'
  }

  if (item.aspect === 'square' || item.aspect === 'wide' || item.aspect === 'tall' || item.aspect === 'portrait') {
    return tileAspectRatio(item.aspect)
  }

  const resolved = resolveAspect(item.aspect, item.type, item.url)
  if (resolved === 'square' || resolved === 'wide' || resolved === 'tall' || resolved === 'portrait') {
    return tileAspectRatio(resolved)
  }

  const isEmbedVid = item.type === 'youtube' || item.type === 'vimeo' ||
    item.url?.includes('youtube') || item.url?.includes('youtu.be')
  if (isEmbedVid) return '16 / 9'
  if (item.type === 'soundcloud') return '16 / 9'
  return tileAspectRatio(resolved)
}

function railHeights(size: number) {
  if (size >= 3) {
    return {
      railHeightMobile: 'min(78vh, 600px)',
      railHeightDesktop: 'min(76vh, 700px)',
    }
  }
  if (size <= 1) {
    return {
      railHeightMobile: 'min(58vh, 420px)',
      railHeightDesktop: 'min(54vh, 500px)',
    }
  }
  return {
    railHeightMobile: 'min(72vh, 540px)',
    railHeightDesktop: 'min(70vh, 640px)',
  }
}

export function getPublicPosterUrl(
  item: any,
  containerMeta?: Record<string, { childCount: number; firstThumb: string | null }>
): string | null {
  const youtubeId = extractYouTubeId(item?.url || '')
  if (youtubeId) {
    const cachedYouTubeThumb = item.thumbnail_url ? transformImageUrl(item.thumbnail_url) : null
    const candidates = [
      cachedYouTubeThumb,
      item.thumbnail_url_override ? transformImageUrl(item.thumbnail_url_override) : null,
      item.thumbnail_url_hq ? transformImageUrl(item.thumbnail_url_hq) : null,
      ...getYouTubeThumbnailCandidates({
        url: item.url,
        media_id: youtubeId,
        thumbnail_url_override: item.thumbnail_url_override,
        thumbnail_url: item.thumbnail_url,
        thumbnail_url_hq: item.thumbnail_url_hq,
      }),
    ].filter(Boolean) as string[]
    return candidates[0] || null
  }

  if (item.type === 'image') return transformImageUrl(item.url) || null
  if (item.type === 'container') {
    return item.container_cover_url || containerMeta?.[item.id]?.firstThumb || null
  }

  const raw =
    item.thumbnail_url_override ||
    item.thumbnail_url_hq ||
    item.thumbnail_url ||
    item.poster_url ||
    containerMeta?.[item.id]?.firstThumb ||
    null

  return raw
}

export function getPublicTileGeometry(
  item: any,
  containerMeta?: Record<string, { childCount: number; firstThumb: string | null }>
): PublicTileGeometry {
  const size = Number(item.size || 1)
  const resolvedAspect = resolveAspect(item.aspect, item.type, item.url)
  const aspectCss = publicAspectCss(item)
  const gridClass = getGridClass(size, resolvedAspect, isVideoTile(item.type, item.url), item.type)
  const fitClass =
    ((item.type === 'spotify' || item.type === 'apple_music') && resolvedAspect === 'wide')
      ? ' self-start'
      : ''
  const [aspectWidth, aspectHeight] = aspectCss.split('/').map(part => Number(part.trim()))
  const aspectRatioValue = Number.isFinite(aspectWidth) && Number.isFinite(aspectHeight) && aspectHeight > 0
    ? aspectWidth / aspectHeight
    : 1
  return {
    resolvedAspect,
    gridClass,
    fitClass,
    aspectCss,
    posterUrl: getPublicPosterUrl(item, containerMeta),
    ...railHeights(size),
    viewportFitHeight: `calc(${100 / aspectRatioValue}vw - ${32 / aspectRatioValue}px)`,
  }
}

export function withPublicTileGeometry<T extends Record<string, any>>(
  item: T,
  containerMeta?: Record<string, { childCount: number; firstThumb: string | null }>
): T & { public_geometry: PublicTileGeometry } {
  return {
    ...item,
    public_geometry: getPublicTileGeometry(item, containerMeta),
  }
}
