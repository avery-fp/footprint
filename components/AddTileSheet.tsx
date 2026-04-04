'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { resolveMediaSync } from '@/lib/media/resolveMedia'

/**
 * ADD TILE SHEET
 *
 * Unified "add content" surface: URL paste + file upload + thought input.
 * Callbacks owned by consumers (home/page, build/page).
 *
 * Mobile: bottom sheet appearance. Desktop: inline panel.
 */

interface AddTileSheetProps {
  open: boolean
  onClose: () => void
  /** Called when user submits a URL */
  onAddUrl: (url: string) => void
  /** Called when user selects files */
  onAddFiles: (files: File[]) => void
  /** Called when user submits a thought */
  onAddThought: (text: string) => void
}

// Platform icon indicators for instant feedback
function getPlatformIcon(type: string | null): string {
  switch (type) {
    case 'youtube': return '▶'
    case 'spotify': return '♫'
    case 'soundcloud': return '♫'
    case 'vimeo': return '▶'
    case 'twitter': return '𝕏'
    case 'instagram': return '◎'
    case 'tiktok': return '♪'
    case 'image': return '▣'
    case 'video': return '▶'
    default: return '◎'
  }
}

function getPlatformColor(type: string | null): string {
  switch (type) {
    case 'youtube': return '#FF0000'
    case 'spotify': return '#1DB954'
    case 'soundcloud': return '#ff5500'
    case 'vimeo': return '#1ab7ea'
    default: return 'rgba(255,255,255,0.4)'
  }
}

export default function AddTileSheet({
  open,
  onClose,
  onAddUrl,
  onAddFiles,
  onAddThought,
}: AddTileSheetProps) {
  const [mode, setMode] = useState<'url' | 'thought'>('url')
  const [urlValue, setUrlValue] = useState('')
  const [thoughtValue, setThoughtValue] = useState('')
  const [detectedType, setDetectedType] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-detect platform as user types
  useEffect(() => {
    if (!urlValue.trim()) {
      setDetectedType(null)
      return
    }
    const resolved = resolveMediaSync(urlValue.trim())
    setDetectedType(resolved ? resolved.type : null)
  }, [urlValue])

  // Focus input on open
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      if (mode === 'url') urlInputRef.current?.focus()
      else thoughtInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [open, mode])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setUrlValue('')
      setThoughtValue('')
      setDetectedType(null)
    }
  }, [open])

  const handleSubmitUrl = useCallback(() => {
    const url = urlValue.trim()
    if (!url) return
    onAddUrl(url)
    setUrlValue('')
    setDetectedType(null)
    onClose()
  }, [urlValue, onAddUrl, onClose])

  const handleSubmitThought = useCallback(() => {
    const text = thoughtValue.trim()
    if (!text) return
    onAddThought(text)
    setThoughtValue('')
    onClose()
  }, [thoughtValue, onAddThought, onClose])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return
      onAddFiles(files)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onClose()
    },
    [onAddFiles, onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md mx-auto bg-[#111] border border-white/10 rounded-t-2xl md:rounded-2xl p-6 pb-8 md:pb-6"
        style={{ animation: 'slideUp 200ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mode tabs */}
        <div className="flex items-center gap-0 mb-5 bg-white/[0.04] rounded-lg p-0.5">
          <button
            onClick={() => setMode('url')}
            className={`flex-1 py-2 text-[12px] font-mono tracking-wider rounded-md transition-all ${
              mode === 'url'
                ? 'bg-white/10 text-white/80'
                : 'text-white/30 hover:text-white/50'
            }`}
          >
            link / upload
          </button>
          <button
            onClick={() => setMode('thought')}
            className={`flex-1 py-2 text-[12px] font-mono tracking-wider rounded-md transition-all ${
              mode === 'thought'
                ? 'bg-white/10 text-white/80'
                : 'text-white/30 hover:text-white/50'
            }`}
          >
            thought
          </button>
        </div>

        {mode === 'url' ? (
          <>
            {/* URL input with platform detection */}
            <div className="relative mb-4">
              <input
                ref={urlInputRef}
                type="text"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitUrl()
                }}
                placeholder="paste any link..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3.5 text-[14px] text-white/80 placeholder:text-white/25 font-mono focus:outline-none focus:border-white/20 transition-colors"
              />
              {detectedType && (
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                  style={{ color: getPlatformColor(detectedType) }}
                >
                  {getPlatformIcon(detectedType)}
                </div>
              )}
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-mono text-white/60 hover:text-white/80 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span className="text-white/40">↑</span>
                upload
              </button>
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-mono text-white/60 hover:text-white/80 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span className="text-white/40">●</span>
                record
              </button>
              {urlValue.trim() && (
                <button
                  onClick={handleSubmitUrl}
                  className="flex-1 py-3 rounded-xl bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all"
                >
                  add
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Thought textarea */}
            <textarea
              ref={thoughtInputRef}
              value={thoughtValue}
              onChange={(e) => setThoughtValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmitThought()
                }
              }}
              placeholder="write something..."
              rows={3}
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3.5 text-[14px] text-white/80 placeholder:text-white/25 font-mono focus:outline-none focus:border-white/20 transition-colors resize-none mb-4"
            />
            {thoughtValue.trim() && (
              <button
                onClick={handleSubmitThought}
                className="w-full py-3 rounded-xl bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all"
              >
                add thought
              </button>
            )}
          </>
        )}

        {/* Hidden file input — gallery picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        {/* Hidden file input — direct camera capture (phone) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
