import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 3600

async function getWallpaper() {
  const { data } = await supabase
    .from('footprints')
    .select('background_url')
    .eq('serial_number', 1001)
    .single()
  return data?.background_url || null
}

async function getNextSerial() {
  const { data } = await supabase
    .from('footprints')
    .select('serial_number')
    .order('serial_number', { ascending: false })
    .limit(1)
    .single()
  return data ? data.serial_number + 1 : 1002
}

export default async function Home() {
  const [wallpaper, nextSerial] = await Promise.all([
    getWallpaper(),
    getNextSerial(),
  ])

  return (
    <div className="min-h-screen relative overflow-hidden">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {wallpaper && (
        <>
          <img
            src={wallpaper}
            alt=""
            className="fixed inset-0 w-full h-full object-cover"
          />
          <div className="fixed inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 35%, rgba(0,0,0,0.88) 100%)' }} />
        </>
      )}

      {!wallpaper && (
        <div className="fixed inset-0 bg-[#080808]" />
      )}

      {/* Serial — top right whisper */}
      <div className="fixed top-6 right-6 md:top-8 md:right-12 z-10">
        <span 
          className="text-white/10"
          style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 400 }}
        >
          #{String(nextSerial).padStart(4, '0')}
        </span>
      </div>

      {/* Bottom-left. Asymmetric. Grounded. */}
      <div className="relative z-10 min-h-screen flex flex-col justify-end px-6 md:px-14 pb-10 md:pb-14">
        
        <div className="max-w-xl">
          <h1
            className="text-white leading-[0.92] mb-4"
            style={{ 
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(52px, 9vw, 108px)',
              fontWeight: 500,
              letterSpacing: '-0.045em',
            }}
          >
            footprint
          </h1>

          <p 
            className="text-white/35 mb-10 max-w-xs"
            style={{ 
              fontFamily: "'Inter', sans-serif",
              fontSize: '14px',
              fontWeight: 300,
              lineHeight: 1.6,
              letterSpacing: '-0.005em',
            }}
          >
            one page. every side of you.
            <br />
            $10. yours forever.
          </p>

          <div className="flex items-center gap-5">
            <Link
              href="/checkout"
              className="rounded-full px-7 py-3 bg-white text-black transition-all duration-200 hover:opacity-90"
              style={{ 
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '-0.01em',
              }}
            >
              Get yours
            </Link>

            <Link
              href="/ae"
              className="text-white/25 hover:text-white/50 transition-colors duration-300"
              style={{ 
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 400,
              }}
            >
              See one →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
