const SUPABASE_PUBLIC_OBJECT_PATH = '/storage/v1/object/public/'
const SUPABASE_PUBLIC_RENDER_PATH = '/storage/v1/render/image/public/'
const SUPABASE_PATTERN = /supabase\.co\/storage\/v1\/(?:object|render\/image)\/public\//
const PUBLIC_IMAGE_WIDTH = '512'
const PUBLIC_IMAGE_QUALITY = '70'

export function transformImageUrl(url: string): string
export function transformImageUrl(url: null | undefined): undefined
export function transformImageUrl(url: string | null | undefined): string | undefined
export function transformImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (SUPABASE_PATTERN.test(url)) {
    try {
      const parsed = new URL(url)
      parsed.pathname = parsed.pathname.replace(SUPABASE_PUBLIC_OBJECT_PATH, SUPABASE_PUBLIC_RENDER_PATH)
      parsed.search = ''
      parsed.searchParams.set('width', PUBLIC_IMAGE_WIDTH)
      parsed.searchParams.set('quality', PUBLIC_IMAGE_QUALITY)
      return parsed.toString()
    } catch {
      return `${url
        .replace(SUPABASE_PUBLIC_OBJECT_PATH, SUPABASE_PUBLIC_RENDER_PATH)
        .replace(/\?.*$/, '')}?width=${PUBLIC_IMAGE_WIDTH}&quality=${PUBLIC_IMAGE_QUALITY}`
    }
  }
  return url
}
