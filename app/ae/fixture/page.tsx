'use client'

import { useState } from 'react'
import GhostTile from '@/components/GhostTile'
import ArtifactImageViewer from '@/components/ArtifactImageViewer'

const FIXTURE_IMAGE =
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=1600&auto=format&fit=crop'

const YOUTUBE_FIXTURE = {
  id: 'fixture-youtube',
  type: 'youtube',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Fixture YouTube',
  thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  media_id: 'dQw4w9WgXcQ',
}

const IMAGE_FIXTURE = {
  id: 'fixture-image',
  type: 'image',
  url: FIXTURE_IMAGE,
  title: 'Fixture Image',
  description: 'Static chamber object for calibrating the artifact viewer without live ledger variance.',
}

export default function ArtifactFixturePage() {
  const [imageOpen, setImageOpen] = useState(false)

  return (
    <main className="min-h-screen bg-[#020202] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 md:px-8">
        <header className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">
            ae / artifact fixture
          </p>
          <h1 className="text-2xl font-light tracking-[0.04em] text-white/90">
            Calibration Chamber
          </h1>
          <p className="max-w-2xl text-sm text-white/40">
            Tune gravity only. No database. No live parse variance. No product noise.
          </p>
        </header>

        <section className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/30">
            Object A — The YouTube Constant
          </p>
          <div className="max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
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

        <section className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/30">
            Object B — The Image Constant
          </p>

          <button
            type="button"
            onClick={() => setImageOpen(true)}
            className="group relative block w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] text-left shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
            aria-label="Open fixture image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={FIXTURE_IMAGE}
              alt=""
              className="block h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
            />
            <div className="pointer-events-none absolute inset-0 bg-black/10 transition-colors duration-300 group-hover:bg-black/0" />
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
