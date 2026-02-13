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
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center">
      {/* Import a typeface with soul */}
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&display=swap" rel="stylesheet" />

      {wallpaper && (
        <>
          <img
            src={wallpaper}
            alt=""
            className="fixed inset-0 w-full h-full object-cover"
          />
          <div className="fixed inset-0 bg-black/55" />
          <div className="fixed inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
        </>
      )}

      {!wallpaper && (
        <>
          <div className="fixed inset-0 bg-[#050507]" />
          <div
            className="fixed inset-0 opacity-20"
            style={{
              background: 'radial-gradient(ellipse at 50% 30%, rgba(100,80,160,0.2) 0%, transparent 60%)',
            }}
          />
        </>
      )}

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        
        {/* THE word. Serif. Light. Large. One typeface choice that carries everything. */}
        <h1
          className="text-[64px] md:text-[88px] lg:text-[104px] leading-none text-white/95 mb-6"
          style={{ 
            fontFamily: "'Cormorant Garamond', 'Georgia', serif",
            fontWeight: 300,
            letterSpacing: '0.02em',
          }}
        >
          footprint
        </h1>

        {/* Subtitle — sans, tiny, maximum contrast with the serif above */}
        <p 
          className="text-[11px] tracking-[0.2em] text-white/30 mb-16"
          style={{ fontFamily: "'Helvetica Neue', 'Helvetica', sans-serif", fontWeight: 300 }}
        >
          your permanent space on the internet
        </p>

        {/* CTA cluster — tight, intentional */}
        <div className="flex flex-col items-center gap-3">
          {/* Serial — integrated into the CTA, not floating */}
          <span 
            className="text-[9px] tracking-[0.15em] text-white/15"
            style={{ fontFamily: "'Helvetica Neue', sans-serif", fontWeight: 300 }}
          >
            #{String(nextSerial).padStart(4, '0')} available
          </span>
          
          <Link
            href="/checkout"
            className="group rounded-full px-12 py-4 text-[11px] tracking-[0.12em] text-white/60 hover:text-white/90 transition-all duration-700 backdrop-blur-sm"
            style={{ 
              fontFamily: "'Helvetica Neue', sans-serif", 
              fontWeight: 300,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span className="group-hover:tracking-[0.16em] transition-all duration-700">
              $10 · yours forever
            </span>
          </Link>
        </div>

        {/* Example link — barely there */}
        <Link
          href="/ae"
          className="mt-12 text-[9px] tracking-[0.1em] text-white/10 hover:text-white/30 transition-all duration-1000"
          style={{ fontFamily: "'Helvetica Neue', sans-serif", fontWeight: 300 }}
        >
          see an example →
        </Link>
      </div>

      {/* Bottom — almost invisible */}
      <div className="fixed bottom-8 left-0 right-0 text-center z-10">
        <p 
          className="text-[8px] tracking-[0.1em] text-white/6"
          style={{ fontFamily: "'Helvetica Neue', sans-serif", fontWeight: 300 }}
        >
          not a subscription. not a template. yours.
        </p>
      </div>
    </div>
  )
}
