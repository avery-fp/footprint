import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { getTheme } from '@/lib/themes'
import { AnalyticsTracker } from '@/components/AnalyticsTracker'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerSupabaseClient()
  const { data: footprint } = await supabase
    .from('footprints')
    .select('display_name, bio, theme, user_id')
    .eq('slug', params.slug)
    .eq('is_public', true)
    .single()

  if (!footprint) return { title: 'Footprint' }

  const { data: user } = await supabase
    .from('users')
    .select('serial_number')
    .eq('id', footprint.user_id)
    .single()

  const serial = user?.serial_number || 0
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

  // Fetch footprint by slug + is_public
  const { data: footprint } = await supabase
    .from('footprints')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_public', true)
    .single()

  if (!footprint) notFound()

  const { data: user } = await supabase
    .from('users')
    .select('serial_number')
    .eq('id', footprint.user_id)
    .single()

  const serial = user?.serial_number || 0

  // Fetch tiles from library (images) + links (embeds/urls)
  const [{ data: images }, { data: links }] = await Promise.all([
    supabase.from('library').select('*').eq('serial_number', serial).order('position'),
    supabase.from('links').select('*').eq('serial_number', serial).order('position'),
  ])

  // Merge and sort by position
  const content = [
    ...(images || []).map((img: any) => ({
      id: img.id,
      type: 'image',
      url: img.image_url,
      title: img.title || null,
      description: img.description || null,
      thumbnail_url: img.image_url,
      position: img.position,
    })),
    ...(links || []).map((link: any) => ({
      id: link.id,
      type: link.platform,
      url: link.url,
      title: link.title,
      description: link.metadata?.description || link.description,
      thumbnail_url: link.thumbnail,
      embed_html: link.metadata?.embed_html,
      position: link.position,
    })),
  ].sort((a, b) => a.position - b.position)

  const theme = getTheme(footprint.theme || 'midnight')

  return (
    <div className="min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      <AnalyticsTracker footprintId={footprint.id} />
      
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="mb-12 text-center">
          {footprint.avatar_url && (
            <img 
              src={footprint.avatar_url} 
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

        {/* Content */}
        <div className="space-y-4">
          {content.map((item: any) => (
            
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded-xl transition-transform hover:scale-[1.02]"
              style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center gap-4">
                {item.thumbnail_url && (
                  <img 
                    src={item.thumbnail_url} 
                    alt="" 
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium truncate">
                    {item.title || item.url}
                  </h3>
                  {item.description && (
                    <p className="text-sm truncate" style={{ color: theme.muted }}>
                      {item.description}
                    </p>
                  )}
                  <p className="text-xs mt-1" style={{ color: theme.muted }}>
                    {new URL(item.url).hostname}
                  </p>
                </div>
              </div>
            </a>
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
