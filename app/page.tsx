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
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap" rel="stylesheet" />

      {wallpaper && (
        <>
          <img
            src={wallpaper}
            alt=""
            className="fixed inset-0 w-full h-full object-cover"
          />
          <div className="fixed inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.9) 100%)' }} />
        </>
      )}

      {!wallpaper && (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      {/* Bottom-left anchored. Not centered. Asymmetry = confidence. */}
      <div className="relative z-10 min-h-screen flex flex-col justify-end px-8 md:px-16 pb-12 md:pb-16">
        
        <div className="max-w-2xl">
          {/* The word. Medium weight. Tight. Present. */}
          <h1
            className="text-white mb-3 leading-[0.9]"
            style={{ 
              fontFamily: "'Inter', -apple-system, sans-serif",
              fontSize: 'clamp(56px, 10vw, 120px)',
              fontWeight: 500,
              letterSpacing: '-0.04em',
            }}
          >
            footprint
          </h1>

          {/* Subtitle — same font, just lighter. Clean hierarchy. */}
          <p 
            className="text-white/40 mb-10 max-w-sm"
            style={{ 
              fontFamily: "'Inter', -apple-system, sans-serif",
              fontSize: '15px',
              fontWeight: 300,
              lineHeight: 1.5,
              letterSpacing: '-0.01em',
            }}
          >
            your permanent space on the internet.
            <br />
            one page. infinite rooms. $10 forever.
          </p>

          {/* CTA row — horizontal, not stacked */}
          <div className="flex items-center gap-6 flex-wrap">
            <Link
              href="/checkout"
              className="rounded-full px-8 py-3 bg-white text-black hover:bg-white/90 transition-all duration-200"
              style={{ 
                fontFamily: "'Inter', -apple-system, sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '-0.01em',
              }}
            >
              Get started
            </Link>

            <Link
              href="/ae"
              className="text-white/30 hover:text-white/60 transition-all duration-300"
              style={{ 
                fontFamily: "'Inter', -apple-system, sans-serif",
                fontSize: '13px',
                fontWeight: 400,
              }}
            >
              See an example →
            </Link>
          </div>
        </div>

        {/* Serial — top right. Counterbalance. */}
        <div className="fixed top-8 right-8 md:right-16">
          <span 
            className="text-white/15"
            style={{ 
              fontFamily: "'Inter', -apple-system, sans-serif",
              fontSize: '11px',
              fontWeight: 400,
              letterSpacing: '0.02em',
            }}
          >
            #{String(nextSerial).padStart(4, '0')}
          </span>
        </div>
      </div>
    </div>
  )
}
