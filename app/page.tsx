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
        {/* æ mark — large, confident */}
        <h1
          className="text-7xl md:text-8xl font-light text-white/90 mb-2"
          style={{ fontFamily: 'serif' }}
        >
          æ
        </h1>

        {/* One line — the entire pitch */}
        <p className="font-mono text-[10px] md:text-[11px] tracking-[0.3em] text-white/40 uppercase">
          Your permanent space on the internet
        </p>

        {/* Serial number whisper */}
        <div className="mt-8 mb-2">
          <span className="font-mono text-[9px] tracking-[0.25em] text-white/20 uppercase">
            #{String(nextSerial).padStart(4, '0')} available
          </span>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/checkout"
            className="group relative rounded-2xl px-10 py-4 font-mono text-[10px] tracking-[0.25em] uppercase text-white/70 hover:text-white transition-all duration-500 border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.05]"
          >
            $10 · Claim yours forever
          </Link>

          <Link
            href="/ae"
            className="font-mono text-[9px] tracking-[0.2em] text-white/15 hover:text-white/40 transition-all duration-700 uppercase"
          >
            see what a footprint looks like →
          </Link>
        </div>
      </div>

      {/* Bottom whisper */}
      <div className="fixed bottom-6 left-0 right-0 text-center z-10">
        <p className="font-mono text-[8px] tracking-[0.2em] text-white/8 uppercase">
          Not a subscription. Not a template. Yours.
        </p>
      </div>
    </div>
  )
}
