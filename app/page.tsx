import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Metadata } from 'next'
import HomePulse from './HomePulse'
import HomeShowcase from './HomeShowcase'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const revalidate = 300

export const metadata: Metadata = {
  title: 'footprint',
  description: 'one page for everything. $10.',
  openGraph: {
    title: 'footprint',
    description: 'one page for everything. $10.',
    images: ['https://footprint.onl/api/og'],
    url: 'https://footprint.onl',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'footprint',
    description: 'one page for everything. $10.',
    images: ['https://footprint.onl/api/og'],
  },
}

async function getWallpaper() {
  const { data } = await getSupabase()
    .from('footprints')
    .select('background_url')
    .eq('serial_number', 1001)
    .single()
  return data?.background_url || null
}

async function getShowcaseRooms() {
  const supabase = getSupabase()

  // Fetch published footprints that have content, most recently updated first
  const { data: fps } = await supabase
    .from('footprints')
    .select('username, display_name, bio, background_url, serial_number')
    .eq('published', true)
    .not('display_name', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(6)

  if (!fps || fps.length === 0) return []

  const rooms = []
  for (const fp of fps) {
    const { data: tiles } = await supabase
      .from('library')
      .select('image_url')
      .eq('serial_number', fp.serial_number)
      .order('position')
      .limit(3)

    const tileUrls = (tiles || []).map(t => t.image_url).filter(Boolean)
    if (tileUrls.length === 0) continue

    rooms.push({
      slug: fp.username,
      name: fp.display_name || fp.username,
      bio: fp.bio || '',
      wallpaper: fp.background_url,
      serial: fp.serial_number,
      tiles: tileUrls,
    })
  }

  return rooms
}

export default async function Home() {
  const [wallpaper, showcaseRooms] = await Promise.all([
    getWallpaper(),
    getShowcaseRooms(),
  ])

  const checkoutUrl = '/checkout'

  return (
    <div className="min-h-screen relative overflow-hidden">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {wallpaper && (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.96) 80%, #080808 100%)',
          }} />
        </>
      )}
      {!wallpaper && <div className="fixed inset-0 bg-[#080808]" />}

      <div className="relative z-10">
        {/* Hero section */}
        <section className="min-h-screen flex flex-col justify-end px-7 md:px-14 pb-14 md:pb-20">
          <div className="max-w-xl">
            <h1
              className="text-white mb-4 leading-[0.92]"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 'clamp(52px, 9vw, 96px)',
                fontWeight: 400,
                letterSpacing: '-0.035em',
              }}
            >
              footprint
            </h1>

            <p
              className="text-white/35 mb-10 leading-relaxed"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                fontWeight: 400,
                letterSpacing: '-0.01em',
              }}
            >
              one page for everything
            </p>

            <div className="flex items-center gap-5">
              <a
                href={checkoutUrl}
                className="rounded-full px-8 py-3 bg-white text-black/90 hover:bg-white/90 transition-all duration-200"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                get yours  $10
              </a>

              <Link
                href="/ae"
                className="text-white/25 hover:text-white/50 transition-colors duration-300"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  fontWeight: 400,
                }}
              >
                see one
              </Link>
            </div>

            <HomePulse />
          </div>
        </section>

        {/* Showcase rooms */}
        {showcaseRooms.length > 0 && (
          <section className="px-7 md:px-14 py-20">
            <HomeShowcase rooms={showcaseRooms} />
          </section>
        )}

        {/* Bottom manifesto */}
        <section className="px-7 md:px-14 pb-24 pt-10">
          <div className="max-w-lg">
            <p
              className="text-white/12 text-sm leading-relaxed mb-12"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              $10 once and it's yours forever
            </p>
            <Link
              href="/auth/login"
              className="text-white/20 hover:text-white/40 text-xs transition-colors"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              sign in
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
