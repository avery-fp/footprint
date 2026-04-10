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
  ]

  // All published footprints
  const { data: footprints } = await supabase
    .from('footprints')
    .select('username, updated_at')
    .eq('published', true)
    .order('updated_at', { ascending: false })
    .limit(5000)

  for (const fp of footprints || []) {
    if (!fp.username) continue
    entries.push({
      url: `${baseUrl}/${fp.username}`,
      lastModified: new Date(fp.updated_at || Date.now()),
      changeFrequency: 'daily',
      priority: 0.7,
    })
  }

  return entries
}
