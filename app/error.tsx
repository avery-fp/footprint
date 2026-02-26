'use client'

import Link from 'next/link'

const DM = "'DM Sans', sans-serif"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#080808]">
      <div className="max-w-md text-center">
        <p
          className="text-white/12 text-[10px] tracking-[0.3em] uppercase mb-10"
          style={{ fontFamily: DM }}
        >
          something broke
        </p>

        <h1
          className="text-white mb-4"
          style={{
            fontFamily: DM,
            fontSize: '28px',
            fontWeight: 300,
            letterSpacing: '-0.02em',
          }}
        >
          we hit a wall
        </h1>

        <p
          className="text-white/25 text-sm mb-10 leading-relaxed"
          style={{ fontFamily: DM }}
        >
          this wasn't supposed to happen. try again.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="rounded-full px-6 py-2.5 bg-white/10 text-white/70 hover:bg-white/15 transition-all text-sm"
            style={{ fontFamily: DM }}
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-white/25 hover:text-white/50 transition-colors text-sm"
            style={{ fontFamily: DM }}
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
