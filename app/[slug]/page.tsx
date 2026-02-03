import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { getTheme } from '@/lib/themes'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ContentCard from '@/components/ContentCard'
import ShareButton from '@/components/ShareButton'

// Force dynamic rendering - never statically generate user pages
export const dynamic = 'force-dynamic'
// Disable all caching and revalidation
export const revalidate = 0

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerSupabaseClient()
  const { data: footprint } = await supabase
    .from('footprints')
    .select('display_name, bio, dimension, serial_number')
    .eq('username', params.slug)
    .eq('published', true)
    .single()

  if (!footprint) return { title: 'Footprint' }

  const serial = footprint.serial_number || 0
  const title = footprint.display_name
    ? `${footprint.display_name} · Footprint #${serial}`
    : `Footprint #${serial}`

  return {
    title,
    description: footprint.bio || 'A digital footprint',
    openGraph: {
      title,
      description: footprint.bio || 'A digital footprint',
      images: [`/api/og?slug=${params.slug}`],
    },
  }
}

export default async function FootprintPage({ params }: Props) {
  const supabase = createServerSupabaseClient()

  // Fetch footprint by username + published
  const { data: footprint } = await supabase
    .from('footprints')
    .select('*')
    .eq('username', params.slug)
    .eq('published', true)
    .single()

  if (!footprint) notFound()

  // Fetch tiles from library (images) + links (embeds/urls)
  const [{ data: images }, { data: links }] = await Promise.all([
    supabase.from('library').select('*').eq('serial_number', footprint.serial_number).order('position'),
    supabase.from('links').select('*').eq('serial_number', footprint.serial_number).order('position'),
  ])

  // Merge and sort by position
  const content = [
    ...(images || []).map((img: any) => ({
      id: img.id,
      type: 'image',
      url: img.image_url,
      position: img.position,
    })),
    ...(links || []).map((link: any) => ({
      id: link.id,
      type: link.platform,
      url: link.url,
      title: link.title,
      thumbnail_url: link.thumbnail,
      embed_html: link.metadata?.embed_html,
      description: link.metadata?.description,
      position: link.position,
    })),
  ].sort((a, b) => a.position - b.position)

  const serial = footprint.serial_number || 0
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`
  const gridMode = footprint.grid_mode || 'public'
  const gridSpacing = gridMode === 'public' ? 'space-y-4' : gridMode === 'edit' ? 'space-y-6' : 'space-y-10'

  return (
    <div className="min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      <AnalyticsTracker footprintId={footprint.id} />

      {/* Share Button */}
      <ShareButton url={pageUrl} />

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="mb-12 text-center">
          {footprint.background_url && (
            <img
              src={footprint.background_url}
              alt=""
              className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
            />
          )}
          <h1 className="text-3xl font-light mb-2">
            {footprint.display_name || `Footprint #${serial}`}
          </h1>
          {footprint.handle && (
            <p style={{ color: theme.muted }}>@{footprint.handle}</p>
          )}
          {footprint.bio && (
            <p className="mt-4 max-w-md mx-auto" style={{ color: theme.muted }}>
              {footprint.bio}
            </p>
          )}
        </header>

        {/* Masonry Grid */}
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 max-w-6xl mx-auto">
          {content.map((item: any) => (
            <div key={item.id} className="break-inside-avoid mb-3">
              {item.type === 'image' ? (
                item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ? (
                  <video
                    src={item.url}
                    className="w-full aspect-video object-cover rounded-2xl"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img
                    src={item.url}
                    className="w-full object-cover rounded-2xl"
                    alt=""
                    loading="lazy"
                  />
                )
              ) : (
                <ContentCard content={item} />
              )}
            </div>
          ))}
        </div>

        {content.length === 0 && (
          <p className="text-center" style={{ color: theme.muted }}>
            Nothing here yet.
          </p>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 text-center text-sm" style={{ 
          borderTop: `1px solid ${theme.border}`,
          color: theme.muted 
        }}>
          <p>Footprint #{serial}</p>
          <p className="mt-2">
            <Link 
              href="/" 
              className="hover:underline"
              style={{ color: theme.accent }}
            >
              Get your own Footprint · $10 forever
            </Link>
          </p>
        </footer>
      </div>
    </div>
  )
}
