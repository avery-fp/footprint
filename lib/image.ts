/**
 * Append Supabase image transform params for faster loading.
 * Non-supabase URLs pass through unchanged.
 */
export function transformImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (url.includes('supabase.co/storage')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}width=600&quality=75`
  }
  return url
}
