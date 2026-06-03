import { tileAspectRatio } from '@/lib/grid-layouts'
import { getGridClass, isVideoTile, resolveAspect } from '@/lib/media/aspect'

export interface PublicTileGeometry {
  resolvedAspect: string
  gridClass: string
  fitClass: string
  aspectCss: string
  railHeightMobile: string
  railHeightDesktop: string
  viewportFitHeight: string
}

function publicAspectCss(item: any): string {
  const isMusic = item.type === 'spotify' || item.type === 'apple_music' || item.type === 'soundcloud' ||
    /(?:open\.spotify\.com|music\.apple\.com|soundcloud\.com)/i.test(item.url || '')
  if (isMusic) return item.aspect === 'wide' || item.aspect === 'landscape' ? '9 / 2' : '1 / 1'

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

export function getPublicTileGeometry(item: any): PublicTileGeometry {
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
    ...railHeights(size),
    viewportFitHeight: `calc(${100 / aspectRatioValue}vw - ${32 / aspectRatioValue}px)`,
  }
}

export function withPublicTileGeometry<T extends Record<string, any>>(item: T): T & { public_geometry: PublicTileGeometry } {
  return {
    ...item,
    public_geometry: getPublicTileGeometry(item),
  }
}
