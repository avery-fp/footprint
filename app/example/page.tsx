'use client'

import { useState } from 'react'
import { PlusButton } from '@/components/PlusButton'
import { RemoveBubble } from '@/components/RemoveBubble'
import { RolodexDrawer } from '@/components/RolodexDrawer'

const DEMO_SLUG = 'ae'

export default function ExamplePage() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#080808] text-white font-sans">
      {/* Simulated profile header zone */}
      <RemoveBubble slug={DEMO_SLUG}>
        <header className="relative flex flex-col items-center pt-28 pb-16">
          {/* + button — top right */}
          <div className="absolute top-6 right-6">
            <PlusButton slug={DEMO_SLUG} />
          </div>

          <h1
            className="text-5xl tracking-[0.15em] font-normal text-white/90"
            style={{ lineHeight: 1 }}
          >
            ae
          </h1>
          <span className="text-white/30 tracking-[0.3em] uppercase text-[10px] font-light mt-2">
            #001
          </span>
          <p className="mt-2 text-white/30 text-[11px] tracking-[0.25em] lowercase font-medium">
            footprint
          </p>
        </header>
      </RemoveBubble>

      {/* Fake content grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-3 max-w-7xl mx-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl bg-white/[0.04] border border-white/[0.06]"
          />
        ))}
      </div>

      {/* Drawer tab */}
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open saved footprints"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-10 h-1 rounded-full bg-white/[0.12] hover:bg-white/[0.2] transition-colors duration-200"
      />
      <RolodexDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
