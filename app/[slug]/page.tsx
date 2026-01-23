import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { getTheme } from '@/lib/themes'
import { AnalyticsTracker } from '@/components/AnalyticsTracker'
import ContentCard from '@/components/ContentCard'

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

  const { data: footprint } = await supabase
    .from('footprints')
    .select('*, content(*)')
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
  const theme = getTheme(footprint.theme || 'midnight')
  const content = (footprint.content || []).sort((a: any, b: any) => a.position - b.position)

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
            <ContentCard key={item.id} content={item} />
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
