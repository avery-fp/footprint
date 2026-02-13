import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 3600 // cache 1hr

async function getWallpaper() {
  // Get ae's wallpaper from footprints table
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
      {/* The wallpaper IS the landing page */}
      {wallpaper && (
        <>
          <img
            src={wallpaper}
            alt=""
            className="fixed inset-0 w-full h-full object-cover"
          />
          {/* Darken overlay for text legibility */}
          <div className="fixed inset-0 bg-black/50" />
          {/* Bottom fade for CTA area */}
          <div className="fixed inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
        </>
      )}

      {/* If no wallpaper, ambient void */}
      {!wallpaper && (
        <>
          <div className="fixed inset-0 bg-[#060608]" />
          <div
            className="fixed inset-0 opacity-30"
            style={{
              background: 'radial-gradient(ellipse at 50% 30%, rgba(120,100,180,0.2) 0%, transparent 60%)',
            }}
          />
        </>
      )}

      {/* Content — centered, minimal */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        {/* Footprint — lowercase, weighted, breathing */}
        <h1 className="text-[42px] md:text-[56px] font-extralight text-white/90 tracking-[0.08em] lowercase" style={{ fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif", letterSpacing: '0.06em' }}>
          footprint
        </h1>

        {/* One line — the entire pitch */}
        <p className="text-[11px] md:text-[12px] tracking-[0.18em] text-white/35 lowercase" style={{ fontFamily: "'Helvetica Neue', 'Helvetica', sans-serif", fontWeight: 300 }}>
          your permanent space on the internet
        </p>

        {/* Serial number whisper */}
        <div className="mt-10 mb-2">
          <span className="text-[10px] tracking-[0.15em] text-white/20 lowercase" style={{ fontFamily: "'Helvetica Neue', 'Helvetica', sans-serif", fontWeight: 300 }}>
            #{String(nextSerial).padStart(4, '0')} available
          </span>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-5">
          <Link
            href="/checkout"
            className="group relative rounded-full px-10 py-4 text-[11px] tracking-[0.15em] lowercase text-white/70 hover:text-white transition-all duration-500 border border-white/[0.12] hover:border-white/[0.25] hover:bg-white/[0.06]"
            style={{ fontFamily: "'Helvetica Neue', 'Helvetica', sans-serif", fontWeight: 300 }}
          >
            $10 · claim yours forever
          </Link>

          <Link
            href="/ae"
            className="text-[10px] tracking-[0.12em] text-white/15 hover:text-white/40 transition-all duration-700 lowercase"
            style={{ fontFamily: "'Helvetica Neue', 'Helvetica', sans-serif", fontWeight: 300 }}
          >
            see what a footprint looks like →
          </Link>
        </div>
      </div>

      {/* Bottom whisper */}
      <div className="fixed bottom-6 left-0 right-0 text-center z-10">
        <p className="text-[9px] tracking-[0.12em] text-white/8 lowercase" style={{ fontFamily: "'Helvetica Neue', 'Helvetica', sans-serif", fontWeight: 300 }}>
          not a subscription. not a template. yours.
        </p>
      </div>
    </div>
  )
}
