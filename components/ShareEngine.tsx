'use client'

import { useEffect, useState } from 'react'

interface ShareEngineProps {
  slug: string
}

interface ShareData {
  share_url: string
  card_url: string
  referral_code: string
  referral_count: number
}

export default function ShareEngine({ slug }: ShareEngineProps) {
  const [data, setData] = useState<ShareData | null>(null)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/share?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => { if (d.share_url) setData(d) })
      .catch(() => {})
  }, [slug])

  if (!data) return null

  function copyLink() {
    if (!data) return
    navigator.clipboard.writeText(data.share_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function shareNative() {
    if (!data) return
    if (navigator.share) {
      navigator.share({
        title: 'Check out my Footprint',
        url: data.share_url,
      }).catch(() => {})
    } else {
      copyLink()
    }
  }

  function downloadCard() {
    if (!data) return
    const a = document.createElement('a')
    a.href = data.card_url
    a.download = `footprint-${slug}.png`
    a.target = '_blank'
    a.click()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 md:left-6 z-40 bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 text-white/60 hover:text-white/80 text-xs font-mono tracking-wide transition-all"
        style={{ top: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        share
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-6 animate-fade-up">
        {/* Close */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
        >
          ×
        </button>

        <p className="font-mono text-xs text-white/40 tracking-widest uppercase mb-4">share</p>

        {/* Share link */}
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 mb-4">
          <p className="font-mono text-xs text-white/50 truncate">{data.share_url}</p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            onClick={copyLink}
            className={`py-2.5 rounded-lg text-xs font-medium transition-all ${
              copied ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/15 text-white/70'
            }`}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={shareNative}
            className="py-2.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 transition-all"
          >
            Share
          </button>
        </div>

        {/* Download cards */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={downloadCard}
            className="py-2.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90 transition-all"
          >
            Share card (1:1)
          </button>
          <button
            onClick={() => {
              if (!data) return
              const storyUrl = data.card_url.replace('/card?', '/story?')
              const a = document.createElement('a')
              a.href = storyUrl
              a.download = `footprint-${slug}-story.png`
              a.target = '_blank'
              a.click()
            }}
            className="py-2.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 transition-all"
          >
            Story card (9:16)
          </button>
        </div>

        {/* QR code */}
        <button
          onClick={() => {
            if (!data) return
            const a = document.createElement('a')
            a.href = `/api/share/qr?slug=${slug}&style=light`
            a.download = `footprint-${slug}-qr.png`
            a.target = '_blank'
            a.click()
          }}
          className="w-full py-2.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white/70 transition-all mb-4"
        >
          Download QR code
        </button>

        {/* Card preview */}
        <div className="rounded-lg overflow-hidden border border-white/[0.06] mb-4">
          <img
            src={data.card_url}
            alt="Share card preview"
            className="w-full"
            loading="lazy"
          />
        </div>

        {/* Referral stats */}
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-white/30">{data.referral_code}</span>
          <span className="text-white/20">
            {data.referral_count} referral{data.referral_count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
