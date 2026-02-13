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
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-end pb-[12vh]">

      {wallpaper && (
        <>
          <img
            src={wallpaper}
            alt=""
            className="fixed inset-0 w-full h-full object-cover"
          />
          <div className="fixed inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.15) 100%)' }} />
        </>
      )}

      {!wallpaper && (
        <div className="fixed inset-0 bg-[#0a0a0a]" />
      )}

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        
        {/* The word. System font. No import. The weight is the design. */}
        <h1
          className="text-white/90 mb-5 leading-none"
          style={{ 
            fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif",
            fontSize: 'clamp(48px, 8vw, 80px)',
            fontWeight: 200,
            letterSpacing: '-0.02em',
          }}
        >
          footprint
        </h1>

        <p 
          className="text-white/30 mb-20"
          style={{ 
            fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
            fontSize: '13px',
            fontWeight: 400,
            letterSpacing: '0.01em',
          }}
        >
          your permanent space on the internet
        </p>

        <div className="flex flex-col items-center gap-6">
          <Link
            href="/checkout"
            className="rounded-full px-10 py-3.5 text-white/90 hover:bg-white hover:text-black transition-all duration-300"
            style={{ 
              fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
              fontSize: '14px',
              fontWeight: 400,
              background: 'rgba(255,255,255,0.12)',
            }}
          >
            Get started — $10
          </Link>

          <Link
            href="/ae"
            className="text-white/25 hover:text-white/50 transition-all duration-500"
            style={{ 
              fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
              fontSize: '12px',
              fontWeight: 400,
            }}
          >
            See an example
          </Link>
        </div>
      </div>
    </div>
  )
}
