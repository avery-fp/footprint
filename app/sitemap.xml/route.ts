import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabaseClient()

  const { data: footprints } = await supabase
    .from('footprints')
    .select('username, updated_at')
    .eq('published', true)
    .not('username', 'is', null)

  const baseUrl = 'https://footprint.onl'

  const urls = [
    `  <url>
    <loc>${baseUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
    ...(footprints || []).map(
      (fp) => `  <url>
    <loc>${baseUrl}/${fp.username}</loc>
    <lastmod>${new Date(fp.updated_at).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    ),
  ]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  return new NextResponse(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
