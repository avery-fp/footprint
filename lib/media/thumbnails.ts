import { extractYouTubeId } from '@/lib/parseEmbed'
import { transformImageUrl } from '@/lib/image'

type ThumbnailLike = {
  type?: string | null
  url?: string | null
  media_id?: string | null
  thumbnail_url_hq?: string | null
  thumbnail_url_override?: string | null
  thumbnail_url?: string | null
  thumbnail?: string | null
  image_url?: string | null
}

function dedupe(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const url of urls) {
    if (!url) continue
    if (seen.has(url)) continue
    seen.add(url)
    result.push(url)
  }

  return result
}

function isRawYouTubeThumbnail(url?: string | null): boolean {
  return Boolean(url && /(?:i\.ytimg\.com|img\.youtube\.com)\/(?:vi|vi_webp)\//.test(url))
}

export function getYouTubeThumbnailCandidates(input: { url?: string | null; media_id?: string | null; thumbnail_url?: string | null; thumbnail_url_hq?: string | null; thumbnail_url_override?: string | null }): string[] {
  const id = input.media_id || (input.url ? extractYouTubeId(input.url) : null)
  const cachedThumb = input.thumbnail_url && !isRawYouTubeThumbnail(input.thumbnail_url)
    ? transformImageUrl(input.thumbnail_url)
    : null
  const cachedOverride = input.thumbnail_url_override && !isRawYouTubeThumbnail(input.thumbnail_url_override)
    ? transformImageUrl(input.thumbnail_url_override)
    : null
  const cachedHq = input.thumbnail_url_hq && !isRawYouTubeThumbnail(input.thumbnail_url_hq)
    ? transformImageUrl(input.thumbnail_url_hq)
    : null

  if (!id) {
    return dedupe([cachedThumb, cachedOverride, cachedHq, input.thumbnail_url, input.thumbnail_url_override, input.thumbnail_url_hq])
  }

  const maxresWebp = `https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`
  const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
  const sdWebp = `https://i.ytimg.com/vi_webp/${id}/sddefault.webp`
  const sd = `https://i.ytimg.com/vi/${id}/sddefault.jpg`
  const hqWebp = `https://i.ytimg.com/vi_webp/${id}/hqdefault.webp`
  const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  const mq = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
  const fallback = `https://i.ytimg.com/vi/${id}/default.jpg`
  const isRawLowResYtimg = (url?: string | null) =>
    Boolean(isRawYouTubeThumbnail(url) && !url?.includes('/maxresdefault.'))

  return dedupe([
    cachedThumb,
    cachedOverride,
    cachedHq,
    input.thumbnail_url_override && !isRawLowResYtimg(input.thumbnail_url_override) ? input.thumbnail_url_override : null,
    input.thumbnail_url_hq && !isRawLowResYtimg(input.thumbnail_url_hq) ? input.thumbnail_url_hq : null,
    input.thumbnail_url && !isRawLowResYtimg(input.thumbnail_url) ? input.thumbnail_url : null,
    maxresWebp,
    maxres,
    input.thumbnail_url_hq,
    sdWebp,
    sd,
    hqWebp,
    hq,
    mq,
    fallback,
    input.thumbnail_url,
  ])
}

export function getThumbnailCandidates(input: ThumbnailLike): string[] {
  const hasYouTubeId = Boolean(input.url && extractYouTubeId(input.url))
  if (input.type === 'youtube' || hasYouTubeId) {
    return getYouTubeThumbnailCandidates({
      ...input,
      media_id: input.type === 'youtube' ? input.media_id : null,
    })
  }

  if (input.type === 'image') {
    return dedupe([input.url, input.image_url, input.thumbnail_url_hq, input.thumbnail_url, input.thumbnail])
  }

  return dedupe([input.thumbnail_url_hq, input.thumbnail_url, input.thumbnail, input.image_url])
}

export function getBestThumbnailUrl(input: ThumbnailLike): string | null {
  return getThumbnailCandidates(input)[0] || null
}

export function applyNextThumbnailFallback(img: HTMLImageElement, candidates: string[]): boolean {
  const current = img.currentSrc || img.src
  const currentIndex = candidates.findIndex(candidate => current.includes(candidate))
  const next = candidates[currentIndex + 1] || candidates.find(candidate => candidate !== current) || null

  if (!next || next === current) return false
  img.src = next
  return true
}

function isInsufficientYouTubeThumbnail(img: HTMLImageElement): boolean {
  const current = img.currentSrc || img.src
  const width = img.naturalWidth || 0

  if (!/(?:ytimg\.com\/(?:vi|vi_webp)\/|img\.youtube\.com\/vi\/)/.test(current)) return false
  if (current.includes('/maxresdefault.') && width > 0 && width < 1280) return true
  if (current.includes('/sddefault.') && width > 0 && width < 640) return true
  if (current.includes('/hqdefault.') && width > 0 && width < 480) return true
  if (current.includes('/mqdefault.') && width > 0 && width < 320) return true

  return false
}

export function applyThumbnailLoadGuard(img: HTMLImageElement, candidates: string[]): boolean {
  if (!isInsufficientYouTubeThumbnail(img)) return false
  return applyNextThumbnailFallback(img, candidates)
}

// True when the thumbnail URL is empty or points at the lowest-res ytimg
// `default.jpg` endpoint — the place the fallback chain lands when every
// higher-res variant returned the grey "video unavailable" placeholder.
export function isBadOrMissingThumbnail(url: string | null | undefined): boolean {
  if (!url) return true
  return /(?:i\.ytimg\.com|img\.youtube\.com)\/vi\/[^/]+\/default\.jpg/.test(url)
}
