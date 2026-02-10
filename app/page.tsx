export default function Home() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full flex flex-col items-center gap-8">

        {/* Logo */}
        <h1 className="text-5xl font-light text-white/90 tracking-tight"
          style={{ fontFamily: 'var(--font-geist-sans)' }}>
          æ
        </h1>

        {/* One line */}
        <p className="text-white/30 text-[11px] tracking-[0.3em] uppercase text-center">
          Own Your Footprint
        </p>

        {/* Live preview of /ae — the product IS the pitch */}
        <div className="w-full rounded-2xl overflow-hidden border border-white/[0.06]">
          <iframe
            src="/ae"
            className="w-full pointer-events-none"
            style={{ height: '700px', transformOrigin: 'top center', transform: 'scale(0.55)' }}
          />
        </div>

        {/* Price */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-white/50 text-sm">
            $10 · yours forever
          </p>
          <a href="/auth/login"
            className="bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] hover:border-white/[0.15] rounded-full px-8 py-3 text-[10px] tracking-[0.3em] uppercase text-white/40 hover:text-white/60 transition-all duration-500">
            Get Started
          </a>
        </div>

        {/* Or just browse */}
        <a href="/ae"
          className="text-white/15 text-[10px] tracking-[0.2em] hover:text-white/30 transition-all duration-700">
          see an example →
        </a>

      </div>
    </div>
  )
}
