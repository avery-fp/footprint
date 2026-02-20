'use client'

import { useState } from 'react'
import Link from 'next/link'

interface DeedClientProps {
  serial: number
  claimed: boolean
  claimedDate: string | null
  name: string | null
  slug: string | null
  wallpaper: string | null
}

const DM = "'DM Sans', sans-serif"

export default function DeedClient({
  serial, claimed, claimedDate, name, slug, wallpaper,
}: DeedClientProps) {
  const [copied, setCopied] = useState(false)
  const serialStr = String(serial).padStart(4, '0')
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://footprint.onl'

  function copyDeedLink() {
    navigator.clipboard.writeText(`${baseUrl}/deed/${serial}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');`}</style>

      {wallpaper && (
        <>
          <img src={wallpaper} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.95) 100%)',
          }} />
        </>
      )}
      {!wallpaper && <div className="fixed inset-0 bg-[#060606]" />}

      <div className="relative z-10 w-full max-w-lg px-8 py-20">
        {/* Brand */}
        <div className="text-center mb-16">
          <p
            className="text-white/20 text-[10px] tracking-[0.3em] uppercase"
            style={{ fontFamily: DM }}
          >
            deed of ownership
          </p>
        </div>

        {/* Serial — the centerpiece */}
        <div className="text-center mb-12">
          <h1
            className="text-white mb-3"
            style={{
              fontFamily: DM,
              fontSize: 'clamp(64px, 12vw, 120px)',
              fontWeight: 300,
              letterSpacing: '-0.04em',
              lineHeight: 0.9,
            }}
          >
            #{serialStr}
          </h1>
          {claimed && (
            <div className="inline-flex items-center gap-2 mt-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
              <span className="text-white/25 text-xs" style={{ fontFamily: DM }}>
                claimed
              </span>
            </div>
          )}
          {!claimed && (
            <div className="inline-flex items-center gap-2 mt-4">
              <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
              <span className="text-white/25 text-xs" style={{ fontFamily: DM }}>
                unclaimed
              </span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6 mb-14">
          {name && (
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
              <span className="text-white/25 text-xs" style={{ fontFamily: DM }}>Owner</span>
              <span className="text-white/70 text-sm" style={{ fontFamily: DM }}>{name}</span>
            </div>
          )}
          {claimedDate && (
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
              <span className="text-white/25 text-xs" style={{ fontFamily: DM }}>Claimed</span>
              <span className="text-white/40 text-sm font-mono">{claimedDate}</span>
            </div>
          )}
          {slug && (
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
              <span className="text-white/25 text-xs" style={{ fontFamily: DM }}>Room</span>
              <Link
                href={`/${slug}`}
                className="text-white/50 hover:text-white/80 text-sm font-mono transition-colors"
              >
                footprint.onl/{slug}
              </Link>
            </div>
          )}
          <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
            <span className="text-white/25 text-xs" style={{ fontFamily: DM }}>Type</span>
            <span className="text-white/40 text-sm font-mono">permanent · non-transferable</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Share / Copy deed link */}
          <button
            onClick={copyDeedLink}
            className="w-full py-3.5 rounded-xl text-sm font-medium transition-all bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] text-white/60"
            style={{ fontFamily: DM }}
          >
            {copied ? 'Link copied' : 'Share this deed'}
          </button>

          {/* QR code download */}
          {slug && (
            <a
              href={`/api/share/qr?slug=${slug}&style=light&size=800`}
              download={`deed-${serialStr}-qr.png`}
              className="block w-full py-3.5 rounded-xl text-sm font-medium transition-all bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-white/40 text-center"
              style={{ fontFamily: DM }}
            >
              Download QR
            </a>
          )}

          {/* CTA for unclaimed */}
          {!claimed && (
            <a
              href="/checkout"
              className="block w-full py-3.5 rounded-xl text-sm font-medium transition-all bg-white text-black/90 hover:bg-white/90 text-center mt-6"
              style={{ fontFamily: DM }}
            >
              get yours  $10
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <Link
            href="/"
            className="text-white/15 text-xs hover:text-white/30 transition-colors"
            style={{ fontFamily: DM }}
          >
            footprint
          </Link>
        </div>
      </div>
    </div>
  )
}
