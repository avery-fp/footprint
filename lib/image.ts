const SUPABASE_PATTERN = /supabase\.co\/storage\/v1\/object\/public\//
export function transformImageUrl(url: string): string
export function transformImageUrl(url: null | undefined): undefined
export function transformImageUrl(url: string | null | undefined): string | undefined
export function transformImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (SUPABASE_PATTERN.test(url)) {
    return url.replace('/object/public/', '/render/image/public/') + '?width=600&quality=75'
  }
  return url
}
