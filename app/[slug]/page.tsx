import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTheme, getThemeCSS } from '@/lib/themes'
import ContentCard from '@/components/ContentCard'
import AnalyticsTracker from '@/components/AnalyticsTracker'

interface PageProps {
  params: { slug: string }
}

export default async function FootprintPage({ params }: PageProps) {
  const supabase = createServerSupabaseClient()
  
  const { data: footprint, error } = await supabase
    .from('footprints')
    .select(`*, users (serial_number), content (*)`)
    .eq('slug', params.slug)
    .eq('is_public', true)
    .single()

  if (error || !footprint) notFound()

  const { data: rooms } = await supabase
    .from('footprints')
    .select('id, slug, name, icon')
    .eq('user_id', footprint.user_id)
    .eq('is_public', true)
    .order('is_primary', { ascending: false })

  const serialNumber = footprint.users?.serial_number || 0
  const content = footprint.content || []
  const theme = getTheme(footprint.theme || 'midnight')
  const themeCSS = getThemeCSS(theme)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `:root { ${themeCSS} }` }} />
      <AnalyticsTracker footprintId={footprint.id} />
      
      <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <header className="sticky top-0 z-50 p-6 flex justify-between items-center" style={{ background: 'linear-gradient(to bottom, var(--bg) 60%, transparent)' }}>
          <Link href="/" className="font-mono text-xs opacity-40 hover:opacity-60 transition-opacity">← footprint</Link>
          <span className="font-mono text-xs opacity-30 tracking-widest">#{serialNumber.toLocaleString()}</span>
        </header>

        <section className="px-6 py-10 max-w-xl mx-auto text-center">
          <div className="w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: footprint.avatar_url ? `url(${footprint.avatar_url}) center/cover` : 'linear-gradient(135deg, var(--glass-hover), var(--glass))', border: '2px solid var(--border)' }}>
            {!footprint.avatar_url && <span className="text-4xl opacity-40">◈</span>}
          </div>
          <h1 className="text-3xl font-normal tracking-tight mb-2">{footprint.display_name || 'Untitled'}</h1>
          {footprint.handle && <p className="font-mono text-sm opacity-50 mb-5">{footprint.handle}</p>}
          {footprint.bio && <p className="opacity-60 leading-relaxed max-w-sm mx-auto mb-6">{footprint.bio}</p>}
          <span className="font-mono text-xs tracking-widest opacity-30">FOOTPRINT #{serialNumber.toLocaleString()}</span>
        </section>

        {rooms && rooms.length > 1 && (
          <nav className="px-6 pb-8 max-w-2xl mx-auto">
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
              {rooms.map((room: any) => (
                <Link key={room.id} href={`/${room.slug}`} className={`px-5 py-2.5 rounded-full font-mono text-xs whitespace-nowrap transition-all ${room.id === footprint.id ? 'text-[var(--bg)]' : 'opacity-60 hover:opacity-100'}`} style={{ background: room.id === footprint.id ? 'var(--accent)' : 'var(--glass)' }}>
                  <span className="mr-2">{room.icon}</span>{room.name}
                </Link>
              ))}
            </div>
          </nav>
        )}

        <section className="px-6 pb-24 max-w-4xl mx-auto">
          {content.length === 0 ? (
            <div className="text-center py-20 opacity-40">
              <p className="text-4xl mb-4 opacity-30">◈</p>
              <p>Nothing here yet</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {content.sort((a: any, b: any) => a.position - b.position).map((item: any) => (
                <ContentCard key={item.id} content={item} />
              ))}
            </div>
          )}
        </section>

        <footer className="py-10 text-center" style={{ borderTop: '1px solid var(--border)' }}>
          <Link href="/" className="font-mono text-xs opacity-25 hover:opacity-40 transition-opacity">Get your own Footprint · $10 forever</Link>
        </footer>
      </div>
    </>
  )
}

export async function generateMetadata({ params }: PageProps) {
  const supabase = createServerSupabaseClient()
  const { data: footprint } = await supabase
    .from('footprints')
    .select('display_name, bio, users(serial_number)')
    .eq('slug', params.slug)
    .single()

  if (!footprint) return { title: 'Footprint' }

  const serial = footprint.users?.serial_number || 0
  const title = footprint.display_name ? `${footprint.display_name} · Footprint #${serial}` : `Footprint #${serial}`
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.link'

  return {
    title,
    description: footprint.bio || 'My universe. Curated.',
    openGraph: {
      title,
      description: footprint.bio || 'My universe. Curated.',
      images: [`${baseUrl}/api/og?slug=${params.slug}`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: footprint.bio || 'My universe. Curated.',
      images: [`${baseUrl}/api/og?slug=${params.slug}`],
    },
  }
}
