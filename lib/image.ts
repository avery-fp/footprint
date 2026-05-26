const SUPABASE_PATTERN = /supabase\.co\/storage\/v1\/(?:object|render\/image)\/public\//
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
