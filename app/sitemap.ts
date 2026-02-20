import { createServerSupabaseClient } from '@/lib/supabase'
import { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'

/**
 * Dynamic sitemap for SEO.
 * Lists all published footprints for search engine discovery.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerSupabaseClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/checkout`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  ]

  // All public footprints via slug
  const { data: slugFps } = await supabase
    .from('footprints')
    .select('slug, updated_at')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(5000)

  // All published footprints via username
  const { data: userFps } = await supabase
    .from('footprints')
    .select('username, updated_at')
    .eq('published', true)
    .order('updated_at', { ascending: false })
    .limit(5000)

  const seen = new Set<string>()

  for (const fp of [...(slugFps || []), ...(userFps || [])]) {
    const id = (fp as any).username || (fp as any).slug
    if (!id || seen.has(id)) continue
    seen.add(id)
    entries.push({
      url: `${baseUrl}/${id}`,
      lastModified: new Date(fp.updated_at || Date.now()),
      changeFrequency: 'daily',
      priority: 0.7,
    })
  }

  return entries
}
