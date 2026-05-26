const SUPABASE_PATTERN = /supabase\.co\/storage\/v1\/(?:object|render\/image)\/public\//
const SUPABASE_RENDER_PARAMS = 'width=512&quality=70'

export function transformImageUrl(url: string): string
export function transformImageUrl(url: null | undefined): undefined
export function transformImageUrl(url: string | null | undefined): string | undefined
export function transformImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (SUPABASE_PATTERN.test(url)) {
    const baseUrl = url
      .replace('/storage/v1/render/image/public/', '/storage/v1/object/public/')
      .replace(/\?.*$/, '')
      .replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
    return `${baseUrl}?${SUPABASE_RENDER_PARAMS}`
  }
  return url
}
