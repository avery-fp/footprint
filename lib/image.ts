const SUPABASE_PUBLIC_STORAGE_MARKER = '/storage/v1/object/public/'
const SUPABASE_PUBLIC_RENDER_MARKER = '/storage/v1/render/image/public/'
const SUPABASE_HOST_PATTERN = /\.supabase\.co$|^supabase\.co$/

interface TransformImageOptions {
  width?: number
  quality?: number
}

export function transformImageUrl(url: string, options?: TransformImageOptions): string
export function transformImageUrl(url: null | undefined): undefined
export function transformImageUrl(url: string | null | undefined, options?: TransformImageOptions): string | undefined
export function transformImageUrl(url: string | null | undefined, options: TransformImageOptions = {}): string | undefined {
  if (!url) return undefined

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (!SUPABASE_HOST_PATTERN.test(parsed.hostname)) return url

  const isPublicObject = parsed.pathname.includes(SUPABASE_PUBLIC_STORAGE_MARKER)
  const isPublicRender = parsed.pathname.includes(SUPABASE_PUBLIC_RENDER_MARKER)
  if (!isPublicObject && !isPublicRender) return url

  const width = options.width ?? 512
  const quality = options.quality ?? 70
  parsed.pathname = parsed.pathname.replace(SUPABASE_PUBLIC_STORAGE_MARKER, SUPABASE_PUBLIC_RENDER_MARKER)
  parsed.search = ''
  parsed.searchParams.set('width', String(width))
  parsed.searchParams.set('quality', String(quality))
  return parsed.toString()
}
