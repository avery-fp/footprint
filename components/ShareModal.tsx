'use client'

import { useState } from 'react'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  url: string
  title?: string
}

export default function ShareModal({ isOpen, onClose, url, title }: ShareModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const copyLink = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      onClose()
    }, 1500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl p-8 max-w-md w-full animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success icon */}
        <div className="w-16 h-16 rounded-full bg-green-400 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl text-black">✓</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-light text-center mb-2">
          {title || "You're in"}
        </h2>

        <p className="text-white/50 text-center text-sm mb-8">
          Share this link with anyone
        </p>

        {/* URL Box */}
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <p className="font-mono text-xs text-white/60 text-center truncate">
            {url}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={copyLink}
            className={`flex-1 py-3 rounded-lg font-medium transition ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition text-white/60"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
