import Link from 'next/link'

const DM = "'DM Sans', sans-serif"
const paymentLink = 'https://buy.stripe.com/9B6cN40Ef0sG2z98b214400'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#080808]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      <div className="max-w-md text-center">
        <p
          className="text-white/12 text-[10px] tracking-[0.3em] uppercase mb-10"
          style={{ fontFamily: DM }}
        >
          unclaimed
        </p>

        <h1
          className="text-white mb-4"
          style={{
            fontFamily: DM,
            fontSize: '36px',
            fontWeight: 300,
            letterSpacing: '-0.03em',
          }}
        >
          this room doesn't exist yet
        </h1>

        <p
          className="text-white/25 text-sm mb-14 leading-relaxed"
          style={{ fontFamily: DM }}
        >
          a room for your internet. $10. yours forever.
        </p>

        <div className="flex items-center justify-center gap-5">
          <a
            href={paymentLink}
            className="rounded-full px-8 py-3 bg-white text-black/90 hover:bg-white/90 transition-all duration-200 text-sm font-medium"
            style={{ fontFamily: DM }}
          >
            Claim yours — $10
          </a>

          <Link
            href="/ae"
            className="text-white/20 hover:text-white/40 transition-colors duration-300 text-sm"
            style={{ fontFamily: DM }}
          >
            See a footprint
          </Link>
        </div>
      </div>
    </div>
  )
}
