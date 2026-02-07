'use client'

import { useState } from 'react'

interface ShareButtonProps {
  url: string
  title?: string
}

export default function ShareButton({ url }: ShareButtonProps) {
  const [showToast, setShowToast] = useState(false)

  async function handleShare() {
    await navigator.clipboard.writeText(url)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  return (
    <>
      <button
        onClick={handleShare}
        className="fixed top-6 right-6 z-40 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white/80 hover:text-white font-mono text-xs transition"
        title="Share this page"
      >
        Share
      </button>

      {showToast && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2 bg-white/20 backdrop-blur-xl rounded-lg text-white text-xs font-mono animate-fade-in">
          Link copied
        </div>
      )}
    </>
  )
}
