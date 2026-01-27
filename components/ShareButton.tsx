'use client'

import { useState } from 'react'
import ShareModal from './ShareModal'

interface ShareButtonProps {
  url: string
  title?: string
}

export default function ShareButton({ url, title }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 right-6 z-40 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white/80 hover:text-white font-mono text-xs transition"
        title="Share this page"
      >
        Share
      </button>

      <ShareModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        url={url}
        title={title}
      />
    </>
  )
}
