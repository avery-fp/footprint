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

export default async function Home() {
  const wallpaper = await getWallpaper()

  // Payment link — goes directly to Stripe. Apple Pay. Google Pay. Card. Done.
  const paymentLink = 'https://buy.stripe.com/9B6cN40Ef0sG2z98b214400'

  return (
    <div className="min-h-screen relative overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');
      `}</style>

      {wallpaper && (
        <>
          <img
            src={wallpaper}
            alt=""
            className="fixed inset-0 w-full h-full object-cover"
          />
          <div className="fixed inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.92) 100%)' }} />
        </>
      )}

      {!wallpaper && (
        <div className="fixed inset-0 bg-[#080808]" />
      )}

      <div className="relative z-10 min-h-screen flex flex-col justify-end px-7 md:px-14 pb-14 md:pb-20">
        
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
            one page. all your things. $10.
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
              Get yours — $10
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
        </div>
      </div>
    </div>
  )
}
