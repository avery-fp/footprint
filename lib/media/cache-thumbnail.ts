import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_STORAGE_MARKER = 'supabase.co/storage/v1/object/public/'
const BUCKET = 'content'
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const TIMEOUT_MS = 5000

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

/** True if url already points to our Supabase Storage bucket. */
export function isCachedThumbnail(url: string | null): boolean {
  return !!url && url.includes(SUPABASE_STORAGE_MARKER)
}

/**
 * Download a remote thumbnail and upload it to Supabase Storage.
 *
 * Returns the permanent public URL, or null on any failure.
 * Never throws. Never blocks tile creation. Invisible infrastructure.
 */
export async function cacheThumbnail(
  remoteUrl: string,
  contentUrl: string,
  serialNumber: number,
): Promise<string | null> {
  // Already ours — no work to do
  if (isCachedThumbnail(remoteUrl)) return remoteUrl

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null

  try {
    const res = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
      },
      redirect: 'follow',
    })

    if (!res.ok) return null

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || ''
    const ext = EXT_MAP[contentType]
    if (!ext) return null // Not a recognized image type — bail

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0 || buffer.length > MAX_SIZE) return null

    const urlHash = createHash('sha256').update(contentUrl).digest('hex').slice(0, 12)
    const storagePath = `thumbnails/${serialNumber}/${urlHash}.${ext}`

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true })

    if (error) {
      console.error('[cache-thumbnail] upload failed:', error.message)
      return null
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    return data.publicUrl.replace(/[\n\r]/g, '')
  } catch (err) {
    console.error('[cache-thumbnail] failed:', (err as Error).message)
    return null
  }
}
