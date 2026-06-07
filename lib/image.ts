const SUPABASE_PATTERN = /supabase\.co\/storage\/v1\/(?:object|render\/image)\/public\//
const SUPABASE_PUBLIC_STORAGE_PATH = /\/storage\/v1\/(?:object|render\/image)\/public\//
const SUPABASE_OBJECT_PUBLIC_PATH = '/storage/v1/object/public/'
const SUPABASE_RENDER_PUBLIC_PATH = '/storage/v1/render/image/public/'
const DISPLAY_IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|webp)$/i
const NON_IMAGE_MEDIA_EXTENSIONS = /\.(?:aac|m4a|mov|mp3|mp4|wav|webm)$/i

export function transformImageUrl(url: string): string
export function transformImageUrl(url: null | undefined): undefined
export function transformImageUrl(url: string | null | undefined): string | undefined
export function transformImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (SUPABASE_PATTERN.test(url)) {
    return url
      .replace('/storage/v1/render/image/public/', '/storage/v1/object/public/')
      .replace(/\?.*$/, '')
  }
  return url
}

interface PublicImageOptions {
  width?: number
  quality?: number
  format?: 'webp' | 'avif' | 'jpeg' | 'jpg' | 'png'
}

export function getPublicImageUrl(url: string, options?: PublicImageOptions): string
export function getPublicImageUrl(url: null | undefined, options?: PublicImageOptions): undefined
export function getPublicImageUrl(url: string | null | undefined, options?: PublicImageOptions): string | undefined
export function getPublicImageUrl(url: string | null | undefined, options: PublicImageOptions = {}): string | undefined {
  if (!url) return undefined
  if (!SUPABASE_PATTERN.test(url)) return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (!SUPABASE_PUBLIC_STORAGE_PATH.test(parsed.pathname)) return url

  const path = parsed.pathname.toLowerCase()
  if (NON_IMAGE_MEDIA_EXTENSIONS.test(path)) return url
  if (!DISPLAY_IMAGE_EXTENSIONS.test(path)) return url

  const width = Math.max(1, Math.round(options.width ?? 720))
  const quality = Math.max(1, Math.min(100, Math.round(options.quality ?? 70)))
  const format = options.format ?? 'webp'

  parsed.pathname = parsed.pathname.replace(SUPABASE_OBJECT_PUBLIC_PATH, SUPABASE_RENDER_PUBLIC_PATH)
  parsed.search = ''
  parsed.searchParams.set('width', String(width))
  parsed.searchParams.set('quality', String(quality))
  parsed.searchParams.set('format', format)

  return parsed.toString()
}
