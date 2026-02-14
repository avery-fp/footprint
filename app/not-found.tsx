import Link from 'next/link'

export default function NotFound() {
  const paymentLink = 'https://buy.stripe.com/9B6cN40Ef0sG2z98b214400'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#08090b]">
      <div className="max-w-md text-center">
        <p
          className="text-white/20 text-xs tracking-widest uppercase mb-8"
          style={{ letterSpacing: '0.15em' }}
        >
          unclaimed
        </p>

        <h1
          className="text-white text-4xl font-light mb-4"
          style={{ letterSpacing: '-0.03em' }}
        >
          this room doesn't exist yet
        </h1>

        <p className="text-white/30 text-sm mb-12 leading-relaxed">
          a room for your internet. $10. yours forever.
        </p>

        <div className="flex items-center justify-center gap-5">
          <a
            href={paymentLink}
            className="rounded-full px-8 py-3 bg-white text-black/90 hover:bg-white/90 transition-all duration-200 text-sm font-medium"
          >
            Claim yours — $10
          </a>

          <Link
            href="/ae"
            className="text-white/25 hover:text-white/50 transition-colors duration-300 text-sm"
          >
            See a footprint
          </Link>
        </div>
      </div>
    </div>
  )
}
