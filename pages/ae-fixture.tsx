'use client'

import { useState } from 'react'
import GhostTile from '@/components/GhostTile'
import ArtifactImageViewer from '@/components/ArtifactImageViewer'

const FIXTURE_IMAGE =
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=1600&auto=format&fit=crop'

const YOUTUBE_FIXTURE = {
  id: 'fixture-youtube',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Fixture YouTube',
  thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  media_id: 'dQw4w9WgXcQ',
}

const IMAGE_FIXTURE = {
  id: 'fixture-image',
  url: FIXTURE_IMAGE,
  title: 'Fixture Image',
  description: 'Static chamber object for calibrating the artifact viewer without live ledger variance.',
}

export default function AeFixturePage() {
  const [imageOpen, setImageOpen] = useState(false)

  return (
    <main className="min-h-screen bg-[#020202] text-white" style={{ minHeight: '100vh', background: '#020202', color: '#fff' }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 md:px-8" style={{ margin: '0 auto', display: 'flex', maxWidth: '72rem', flexDirection: 'column', gap: 40, padding: '40px 16px' }}>
        <header className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/35" style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.35)' }}>
            ae / artifact fixture
          </p>
          <h1 className="text-2xl font-light tracking-[0.04em] text-white/90" style={{ margin: 0, fontSize: 24, fontWeight: 300, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.9)' }}>
            Calibration Chamber
          </h1>
          <p className="max-w-2xl text-sm text-white/40" style={{ margin: 0, maxWidth: '42rem', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
            Tune gravity only. No database. No live parse variance. No product noise.
          </p>
        </header>

        <section className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/30" style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)' }}>
            Object A - The YouTube Constant
          </p>
          <div className="max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]" style={{ maxWidth: '48rem', overflow: 'hidden', borderRadius: 28, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', padding: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}>
            <GhostTile
              url={YOUTUBE_FIXTURE.url}
              platform="youtube"
              media_id={YOUTUBE_FIXTURE.media_id}
              title={YOUTUBE_FIXTURE.title}
              thumbnail_url={YOUTUBE_FIXTURE.thumbnail_url}
              size={1}
            />
          </div>
        </section>

        <section className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/30" style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)' }}>
            Object B - The Image Constant
          </p>

          <button
            type="button"
            onClick={() => setImageOpen(true)}
            className="group relative block w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] text-left shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
            aria-label="Open fixture image"
            style={{ position: 'relative', display: 'block', width: '100%', maxWidth: '28rem', overflow: 'hidden', borderRadius: 28, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', textAlign: 'left', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={FIXTURE_IMAGE}
              alt=""
              className="block h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
              style={{ display: 'block', height: 'auto', width: '100%', objectFit: 'cover' }}
            />
            <div className="pointer-events-none absolute inset-0 bg-black/10 transition-colors duration-300 group-hover:bg-black/0" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.1)' }} />
          </button>
        </section>
      </div>

      <ArtifactImageViewer
        item={IMAGE_FIXTURE}
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      />
    </main>
  )
}
