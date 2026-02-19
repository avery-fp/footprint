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
  title: 'Footprint — your internet room',
  description: 'A permanent room for everything you love on the internet. One payment. Yours forever. $10.',
  openGraph: {
    title: 'Footprint — your internet room',
    description: 'A permanent room for everything you love on the internet. One payment. Yours forever. $10.',
    images: ['https://footprint.onl/api/og'],
    url: 'https://footprint.onl',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Footprint — your internet room',
    description: 'A permanent room for everything you love on the internet. $10.',
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
  const slugs = ['ae']
  const supabase = getSupabase()

  const rooms = []
  for (const slug of slugs) {
    const { data: fp } = await supabase
      .from('footprints')
      .select('username, display_name, bio, background_url, serial_number')
      .eq('username', slug)
      .eq('published', true)
      .single()

    if (!fp) continue

    const { data: tiles } = await supabase
      .from('library')
      .select('image_url')
      .eq('serial_number', fp.serial_number)
      .order('position')
      .limit(3)

    rooms.push({
      slug: fp.username,
      name: fp.display_name || slug,
      bio: fp.bio || '',
      wallpaper: fp.background_url,
      serial: fp.serial_number,
      tiles: (tiles || []).map(t => t.image_url).filter(Boolean),
    })
  }

  return rooms
}

export default async function Home() {
  const [wallpaper, showcaseRooms] = await Promise.all([
    getWallpaper(),
    getShowcaseRooms(),
  ])

  const paymentLink = 'https://buy.stripe.com/9B6cN40Ef0sG2z98b214400'

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
              a room for your internet.
            </p>

            <div className="flex items-center gap-5">
              <a
                href={paymentLink}
                className="rounded-full px-8 py-3 bg-white text-black/90 hover:bg-white/90 transition-all duration-200"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                Claim yours — $10
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
                See a footprint
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
              no subscriptions. no refunds. no bullshit.
            </p>
            <a
              href={paymentLink}
              className="text-white/20 hover:text-white/40 text-xs transition-colors"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Claim your footprint — $10
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
